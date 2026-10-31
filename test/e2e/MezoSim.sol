// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

// Local end-to-end simulator of the Mezo testnet contracts SettleTag's app calls. Each contract's
// runtime code is placed at the real Mezo testnet address on a local chain with chain ID 31611, so
// the production app runs unchanged against it. Numbers are simplified: fixed $100,000 BTC price,
// 0.1% borrowing fee, 1,800 MUSD minimum net debt, 200 MUSD gas reserve, no interest or sorting.
// Nothing here is deployed to a public network.

interface ISimToken {
    function mint(address to, uint256 amount) external;
    function burn(address from, uint256 amount) external;
    function balanceOf(address who) external view returns (uint256);
}

address constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;
address constant CORE = 0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0; // TroveManager address
uint256 constant PRICE = 100_000e18;
uint256 constant RATE = 1e15; // 0.1%
uint256 constant MIN_NET_DEBT = 1_800e18;
uint256 constant GAS_COMP = 200e18;
uint256 constant MCR = 110e16;

/// Placed at the TroveManager address. Holds all trove state.
contract MezoSimCore {
    struct Trove { uint256 coll; uint256 debt; uint8 status; uint256 cap; }
    mapping(address => Trove) public troves;
    uint256 public totalColl;
    uint256 public totalDebt;

    function MUSD_GAS_COMPENSATION() external pure returns (uint256) { return GAS_COMP; }
    function getTroveStatus(address b) external view returns (uint8) { return troves[b].status; }
    function getEntireDebtAndColl(address b) external view returns (uint256, uint256, uint256, uint256, uint256, uint256) {
        return (troves[b].coll, troves[b].debt, 0, 0, 0, 0);
    }
    function getCurrentICR(address b, uint256 p) external view returns (uint256) { return troves[b].coll * p / troves[b].debt; }
    function getTroveMaxBorrowingCapacity(address b) external view returns (uint256) { return troves[b].cap; }
    function getTroveInterestRate(address) external pure returns (uint16) { return 100; }
    function getTCR(uint256 p) public view returns (uint256) { return totalDebt == 0 ? type(uint256).max : totalColl * p / totalDebt; }
    function checkRecoveryMode(uint256 p) external view returns (bool) { return getTCR(p) < 15e17; }

    function simOpen(address b, address recipient, uint256 coll, uint256 amount) external {
        require(troves[b].status != 1, "BorrowerOps: Trove is active");
        uint256 net = amount + amount * RATE / 1e18;
        require(net >= MIN_NET_DEBT, "BorrowerOps: Trove's net debt must be greater than minimum");
        uint256 debt = net + GAS_COMP;
        require(coll * PRICE / debt >= MCR, "BorrowerOps: An operation that would result in ICR < MCR is not permitted");
        troves[b] = Trove(coll, debt, 1, coll * PRICE / MCR);
        totalColl += coll; totalDebt += debt;
        ISimToken(MUSD).mint(recipient, amount);
    }
    function simDraw(address b, address recipient, uint256 amount) external {
        Trove storage t = troves[b];
        require(t.status == 1, "BorrowerOps: Trove does not exist or is closed");
        uint256 change = amount + amount * RATE / 1e18;
        require(t.cap >= t.debt + change, "BorrowerOps: An operation that exceeds maxBorrowingCapacity is not permitted");
        require(t.coll * PRICE / (t.debt + change) >= MCR, "BorrowerOps: An operation that would result in ICR < MCR is not permitted");
        t.debt += change; totalDebt += change;
        ISimToken(MUSD).mint(recipient, amount);
    }
    function simAddColl(address b, uint256 amount) external {
        require(troves[b].status == 1, "BorrowerOps: Trove does not exist or is closed");
        troves[b].coll += amount; totalColl += amount;
    }
    function simRepay(address b, uint256 amount) external {
        Trove storage t = troves[b];
        require(t.status == 1, "BorrowerOps: Trove does not exist or is closed");
        require(t.debt - GAS_COMP - amount >= MIN_NET_DEBT, "BorrowerOps: Trove's net debt must be greater than minimum");
        require(ISimToken(MUSD).balanceOf(b) >= amount, "BorrowerOps: Caller doesnt have enough mUSD to make repayment");
        ISimToken(MUSD).burn(b, amount);
        t.debt -= amount; totalDebt -= amount;
    }
}

/// Placed at the BorrowerOperations address.
contract MezoSimBorrowerOperations {
    function openTrove(uint256 amount, address, address) external payable { MezoSimCore(CORE).simOpen(msg.sender, msg.sender, msg.value, amount); }
    function addColl(address, address) external payable { MezoSimCore(CORE).simAddColl(msg.sender, msg.value); }
    function repayMUSD(uint256 amount, address, address) external { MezoSimCore(CORE).simRepay(msg.sender, amount); }
    function withdrawMUSD(uint256 amount, address, address) external { MezoSimCore(CORE).simDraw(msg.sender, msg.sender, amount); }
    function borrowingRate() external pure returns (uint256) { return RATE; }
    function minNetDebt() external pure returns (uint256) { return MIN_NET_DEBT; }
    function getBorrowingFee(uint256 d) external pure returns (uint256) { return d * RATE / 1e18; }
}

/// Placed at the BorrowerOperationsSignatures address. Signature checks copy mezo-org/musd.
contract MezoSimSignatures {
    bytes32 private constant DOMAIN_TYPEHASH = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant OPEN_TROVE_TYPEHASH = keccak256("OpenTrove(uint256 assetAmount,uint256 debtAmount,address borrower,address recipient,uint256 nonce,uint256 deadline)");
    bytes32 private constant WITHDRAW_MUSD_TYPEHASH = keccak256("WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)");
    mapping(address => uint256) private nonces;

    function getNonce(address user) external view returns (uint256) { return nonces[user]; }
    function borrowerOperations() external pure returns (address) { return 0xCdF7028ceAB81fA0C6971208e83fa7872994beE5; }
    function openTroveWithSignature(uint256 debtAmount, address, address, address borrower, address recipient, bytes memory signature, uint256 deadline) external payable {
        _verify(OPEN_TROVE_TYPEHASH, abi.encode(msg.value, debtAmount, borrower, recipient), borrower, signature, deadline);
        MezoSimCore(CORE).simOpen(borrower, recipient, msg.value, debtAmount);
    }
    function withdrawMUSDWithSignature(uint256 amount, address, address, address borrower, address recipient, bytes memory signature, uint256 deadline) external {
        _verify(WITHDRAW_MUSD_TYPEHASH, abi.encode(amount, borrower, recipient), borrower, signature, deadline);
        MezoSimCore(CORE).simDraw(borrower, recipient, amount);
    }
    function _verify(bytes32 typeHash, bytes memory data, address borrower, bytes memory signature, uint256 deadline) internal {
        require(block.timestamp <= deadline, "Signature expired");
        bytes32 domain = keccak256(abi.encode(DOMAIN_TYPEHASH, keccak256("BorrowerOperationsSignatures"), keccak256("1"), block.chainid, address(this)));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, keccak256(abi.encodePacked(typeHash, data, nonces[borrower], deadline))));
        require(signature.length == 65, "ECDSA: invalid signature length");
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := mload(add(signature, 0x20)) s := mload(add(signature, 0x40)) v := byte(0, mload(add(signature, 0x60))) }
        require(ecrecover(digest, v, r, s) == borrower, "BorrowerOperationsSignatures: Invalid signature");
        nonces[borrower]++;
    }
}

/// Placed at the PriceFeed address.
contract MezoSimPriceFeed { function fetchPrice() external pure returns (uint256) { return PRICE; } }

/// Placed at both the HintHelpers and SortedTroves addresses.
contract MezoSimHints {
    function getApproxHint(uint256, uint256, uint256 seed) external pure returns (address, uint256, uint256) { return (address(0), 0, seed); }
    function getSize() external pure returns (uint256) { return 0; }
    function findInsertPosition(uint256, address, address) external pure returns (address, address) { return (address(0), address(0)); }
}
