// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Mezo's signature entry point for trove operations (BorrowerOperationsSignatures).
/// @dev The borrower signs an EIP-712 message naming SettleTag as the MUSD recipient.
interface IBorrowerOperationsSignatures {
    function withdrawMUSDWithSignature(
        uint256 amount,
        address upperHint,
        address lowerHint,
        address borrower,
        address recipient,
        bytes calldata signature,
        uint256 deadline
    ) external;

    function openTroveWithSignature(
        uint256 debtAmount,
        address upperHint,
        address lowerHint,
        address borrower,
        address recipient,
        bytes calldata signature,
        uint256 deadline
    ) external payable;
}

/// @notice One-time MUSD invoices on Mezo. A payer can settle from their wallet, or borrow the
/// MUSD against BTC through their own Mezo trove in the same transaction.
/// @dev SettleTag does not hold funds between transactions. Wallet payments move MUSD straight from
/// payer to merchant. Trove-funded payments route freshly minted MUSD through this contract and
/// forward all of it within the same call (see returnStrandedMUSD for the one exception).
/// A settlement fee goes to the treasury; Pro merchants pay no fee.
/// Invoice IDs are derived from the merchant and a salt, so nobody can claim a chosen ID.
contract SettleTag {
    enum Status { Missing, Open, Paid, Cancelled }
    enum Funding { None, Wallet, TroveDraw, TroveOpen }

    struct Invoice {
        address merchant;
        uint64 deadline;
        Status status;
        Funding funding;
        uint16 feeBps;
        uint128 amount;
        address payer;
    }

    uint16 public constant MAX_FEE_BPS = 100; // 1%
    uint256 public constant PRO_PERIOD = 30 days;
    uint256 public constant MAX_PRO_PERIODS = 12;
    uint256 public constant MAX_INVOICE_DURATION = 90 days;

    address public immutable musd;
    address public immutable borrowerOperationsSignatures;

    address public owner;
    address public treasury;
    uint16 public feeBps;
    uint128 public proPlanPrice;

    mapping(bytes32 => Invoice) public invoices;
    mapping(address => uint256) public proUntil;
    mapping(address => bool) public isMerchant;
    mapping(address => bool) public isPayer;

    uint256 public invoiceCount;
    uint256 public paidCount;
    uint256 public settledVolume;
    uint256 public feeRevenue;
    uint256 public planRevenue;
    uint256 public merchantCount;
    uint256 public payerCount;
    uint256 public troveFundedCount;
    uint256 public troveFundedVolume;

    bool private locked;

    event InvoiceCreated(bytes32 indexed id, address indexed merchant, uint256 amount, uint64 deadline, uint16 feeBps);
    event InvoicePaid(
        bytes32 indexed id, address indexed merchant, address indexed payer, uint256 amount, uint256 fee, Funding funding
    );
    event InvoiceCancelled(bytes32 indexed id, address indexed merchant);
    event TroveBorrowed(bytes32 indexed id, address indexed payer, uint256 borrowed, uint256 refunded, Funding funding);
    event ProPlanPurchased(address indexed merchant, uint256 periods, uint256 cost, uint256 proUntil);
    event FeeUpdated(uint16 feeBps);
    event ProPlanPriceUpdated(uint128 price);
    event TreasuryUpdated(address treasury);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);
    event StrandedMUSDReturned(address indexed to, uint256 amount);

    error InvalidAddress();
    error InvalidInvoice();
    error InvoiceExists();
    error NotMerchant();
    error NotOpen();
    error Expired();
    error SelfPayment();
    error TransferFailed();
    error InvalidBorrow();
    error BorrowMismatch();
    error InvalidFee();
    error InvalidPeriods();
    error PlanDisabled();
    error NotOwner();
    error Reentrancy();
    error UnexpectedBTC();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier nonReentrant() {
        if (locked) revert Reentrancy();
        locked = true;
        _;
        locked = false;
    }

    constructor(address musd_, address borrowerOperationsSignatures_, address treasury_, uint16 feeBps_, uint128 proPlanPrice_) {
        if (musd_.code.length == 0 || borrowerOperationsSignatures_.code.length == 0) revert InvalidAddress();
        if (treasury_ == address(0) || treasury_ == musd_) revert InvalidAddress();
        if (feeBps_ > MAX_FEE_BPS) revert InvalidFee();
        musd = musd_;
        borrowerOperationsSignatures = borrowerOperationsSignatures_;
        owner = msg.sender;
        treasury = treasury_;
        feeBps = feeBps_;
        proPlanPrice = proPlanPrice_;
        emit OwnershipTransferred(address(0), msg.sender);
        emit TreasuryUpdated(treasury_);
        emit FeeUpdated(feeBps_);
        emit ProPlanPriceUpdated(proPlanPrice_);
    }

    /// @notice Mezo's ActivePool sends the borrower's collateral change to the MUSD recipient, which is
    /// zero BTC for a trove draw. Accept that empty call; reject any real BTC so none can get stuck here.
    receive() external payable {
        if (msg.value != 0) revert UnexpectedBTC();
    }

    // --- Merchant ---

    /// @param salt Random 32 bytes from the merchant's client. The invoice ID is invoiceId(msg.sender, salt).
    /// @param amount Exact MUSD amount the payer settles, in token base units.
    /// @param deadline Expiry, at most 90 days ahead.
    /// @dev The fee rate is fixed when the invoice is created, so later fee changes never alter an open invoice.
    function createInvoice(bytes32 salt, uint128 amount, uint64 deadline) external returns (bytes32 id) {
        if (amount == 0 || deadline <= block.timestamp || deadline > block.timestamp + MAX_INVOICE_DURATION) {
            revert InvalidInvoice();
        }
        id = invoiceId(msg.sender, salt);
        if (invoices[id].status != Status.Missing) revert InvoiceExists();
        uint16 rate = effectiveFeeBps(msg.sender);
        invoices[id] = Invoice(msg.sender, deadline, Status.Open, Funding.None, rate, amount, address(0));
        invoiceCount++;
        emit InvoiceCreated(id, msg.sender, amount, deadline, rate);
    }

    function cancelInvoice(bytes32 id) external {
        Invoice storage invoice = invoices[id];
        if (invoice.merchant != msg.sender) revert NotMerchant();
        if (invoice.status != Status.Open) revert NotOpen();
        invoice.status = Status.Cancelled;
        emit InvoiceCancelled(id, msg.sender);
    }

    /// @notice Pro merchants settle with no SettleTag fee. Each period is 30 days and stacks on any active plan.
    function buyProPlan(uint256 periods) external nonReentrant {
        if (periods == 0 || periods > MAX_PRO_PERIODS) revert InvalidPeriods();
        uint256 price = proPlanPrice;
        if (price == 0) revert PlanDisabled();
        uint256 cost = price * periods;
        uint256 start = proUntil[msg.sender] > block.timestamp ? proUntil[msg.sender] : block.timestamp;
        uint256 until = start + periods * PRO_PERIOD;
        proUntil[msg.sender] = until;
        planRevenue += cost;
        _transferFrom(msg.sender, treasury, cost);
        emit ProPlanPurchased(msg.sender, periods, cost, until);
    }

    // --- Payer ---

    /// @notice Pay from wallet MUSD. Approve the invoice amount to this contract first.
    function payInvoice(bytes32 id) external nonReentrant {
        (Invoice storage invoice, uint256 amount, uint256 fee) = _settle(id, Funding.Wallet);
        _transferFrom(msg.sender, invoice.merchant, amount - fee);
        if (fee != 0) _transferFrom(msg.sender, treasury, fee);
        emit InvoicePaid(id, invoice.merchant, msg.sender, amount, fee, Funding.Wallet);
    }

    /// @notice Borrow the invoice amount from the caller's existing Mezo trove and settle in one transaction.
    /// @param signature EIP-712 WithdrawMUSD signature from the caller, with this contract as recipient.
    function payWithTroveDraw(
        bytes32 id,
        address upperHint,
        address lowerHint,
        bytes calldata signature,
        uint256 signatureDeadline
    ) external nonReentrant {
        (Invoice storage invoice, uint256 amount, uint256 fee) = _settle(id, Funding.TroveDraw);
        uint256 before = _balance();
        IBorrowerOperationsSignatures(borrowerOperationsSignatures).withdrawMUSDWithSignature(
            amount, upperHint, lowerHint, msg.sender, address(this), signature, signatureDeadline
        );
        if (_balance() - before != amount) revert BorrowMismatch();
        _forward(invoice.merchant, amount - fee, fee);
        _recordTroveFunding(amount);
        emit TroveBorrowed(id, msg.sender, amount, 0, Funding.TroveDraw);
        emit InvoicePaid(id, invoice.merchant, msg.sender, amount, fee, Funding.TroveDraw);
    }

    /// @notice Open a Mezo trove for the caller with the attached BTC, borrow `debtAmount` MUSD, settle the
    /// invoice and return the rest of the loan to the caller, all in one transaction.
    /// @dev Mezo enforces a minimum net debt, so a new trove usually borrows more than the invoice amount.
    /// @param signature EIP-712 OpenTrove signature from the caller, with this contract as recipient and
    /// `msg.value` as the asset amount.
    function payByOpeningTrove(
        bytes32 id,
        uint256 debtAmount,
        address upperHint,
        address lowerHint,
        bytes calldata signature,
        uint256 signatureDeadline
    ) external payable nonReentrant {
        (Invoice storage invoice, uint256 amount, uint256 fee) = _settle(id, Funding.TroveOpen);
        if (msg.value == 0 || debtAmount < amount) revert InvalidBorrow();
        uint256 before = _balance();
        IBorrowerOperationsSignatures(borrowerOperationsSignatures).openTroveWithSignature{value: msg.value}(
            debtAmount, upperHint, lowerHint, msg.sender, address(this), signature, signatureDeadline
        );
        if (_balance() - before != debtAmount) revert BorrowMismatch();
        _forward(invoice.merchant, amount - fee, fee);
        uint256 refund = debtAmount - amount;
        if (refund != 0) _transfer(msg.sender, refund);
        _recordTroveFunding(amount);
        emit TroveBorrowed(id, msg.sender, debtAmount, refund, Funding.TroveOpen);
        emit InvoicePaid(id, invoice.merchant, msg.sender, amount, fee, Funding.TroveOpen);
    }

    // --- Views ---

    function invoiceId(address merchant, bytes32 salt) public pure returns (bytes32) {
        return keccak256(abi.encode(merchant, salt));
    }

    function isPro(address merchant) public view returns (bool) {
        return proUntil[merchant] > block.timestamp;
    }

    function effectiveFeeBps(address merchant) public view returns (uint16) {
        return isPro(merchant) ? 0 : feeBps;
    }

    /// @return amount What the payer settles.
    /// @return fee SettleTag's share, fixed at invoice creation.
    /// @return merchantReceives What reaches the merchant.
    function quote(bytes32 id) external view returns (uint256 amount, uint256 fee, uint256 merchantReceives) {
        Invoice storage invoice = invoices[id];
        amount = invoice.amount;
        fee = amount * invoice.feeBps / 10_000;
        merchantReceives = amount - fee;
    }

    function stats()
        external
        view
        returns (
            uint256 invoices_,
            uint256 paid,
            uint256 volume,
            uint256 fees,
            uint256 plans,
            uint256 merchants,
            uint256 payers,
            uint256 troveFunded,
            uint256 troveVolume
        )
    {
        return (
            invoiceCount, paidCount, settledVolume, feeRevenue, planRevenue,
            merchantCount, payerCount, troveFundedCount, troveFundedVolume
        );
    }

    // --- Admin ---

    function setFeeBps(uint16 newFeeBps) external onlyOwner {
        if (newFeeBps > MAX_FEE_BPS) revert InvalidFee();
        feeBps = newFeeBps;
        emit FeeUpdated(newFeeBps);
    }

    function setProPlanPrice(uint128 price) external onlyOwner {
        proPlanPrice = price;
        emit ProPlanPriceUpdated(price);
    }

    function setTreasury(address newTreasury) external onlyOwner {
        if (newTreasury == address(0) || newTreasury == musd || newTreasury == address(this)) revert InvalidAddress();
        treasury = newTreasury;
        emit TreasuryUpdated(newTreasury);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert InvalidAddress();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    /// @notice SettleTag forwards everything it receives within the same transaction, so its balance is
    /// normally zero. MUSD is left here only if someone submits a payer's signed Mezo request straight
    /// to BorrowerOperationsSignatures instead of through SettleTag (possible for anyone who sees the
    /// signature before it is used). The payer keeps the debt; the owner returns the MUSD to that payer,
    /// identified from the explorer.
    function returnStrandedMUSD(address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidAddress();
        _transfer(to, amount);
        emit StrandedMUSDReturned(to, amount);
    }

    // --- Internal ---

    /// @dev Checks the invoice, marks it paid before any external call, and updates counters.
    function _settle(bytes32 id, Funding funding) private returns (Invoice storage invoice, uint256 amount, uint256 fee) {
        invoice = invoices[id];
        if (invoice.status != Status.Open) revert NotOpen();
        if (block.timestamp > invoice.deadline) revert Expired();
        if (msg.sender == invoice.merchant) revert SelfPayment();
        invoice.status = Status.Paid;
        invoice.payer = msg.sender;
        invoice.funding = funding;
        amount = invoice.amount;
        fee = amount * invoice.feeBps / 10_000;
        paidCount++;
        settledVolume += amount;
        feeRevenue += fee;
        // Merchants count once they are paid by someone else, not when they create an invoice.
        if (!isMerchant[invoice.merchant]) {
            isMerchant[invoice.merchant] = true;
            merchantCount++;
        }
        if (!isPayer[msg.sender]) {
            isPayer[msg.sender] = true;
            payerCount++;
        }
    }

    function _recordTroveFunding(uint256 amount) private {
        troveFundedCount++;
        troveFundedVolume += amount;
    }

    function _forward(address merchant, uint256 net, uint256 fee) private {
        _transfer(merchant, net);
        if (fee != 0) _transfer(treasury, fee);
    }

    function _balance() private view returns (uint256 value) {
        (bool ok, bytes memory data) = musd.staticcall(abi.encodeWithSelector(0x70a08231, address(this)));
        if (!ok || data.length < 32) revert TransferFailed();
        value = abi.decode(data, (uint256));
    }

    // Handle standard ERC-20 return values and tokens that return no value.
    function _transferFrom(address from, address to, uint256 amount) private {
        _call(abi.encodeWithSelector(0x23b872dd, from, to, amount));
    }

    function _transfer(address to, uint256 amount) private {
        _call(abi.encodeWithSelector(0xa9059cbb, to, amount));
    }

    function _call(bytes memory payload) private {
        (bool ok, bytes memory data) = musd.call(payload);
        if (!ok || (data.length != 0 && (data.length != 32 || !abi.decode(data, (bool))))) revert TransferFailed();
    }
}
