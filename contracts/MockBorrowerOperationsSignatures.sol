// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

interface IMintable {
    function mint(address to, uint256 amount) external;
}

/// @dev Local test double for Mezo's BorrowerOperationsSignatures. The EIP-712 domain, type strings,
/// digest construction and nonce handling copy mezo-org/musd so tests exercise the same signatures the
/// app produces for Mezo testnet. Trove accounting is simplified: no price, fees or hints.
contract MockBorrowerOperationsSignatures {
    bytes32 private constant DOMAIN_TYPEHASH =
        keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)");
    bytes32 private constant OPEN_TROVE_TYPEHASH = keccak256(
        "OpenTrove(uint256 assetAmount,uint256 debtAmount,address borrower,address recipient,uint256 nonce,uint256 deadline)"
    );
    bytes32 private constant WITHDRAW_MUSD_TYPEHASH =
        keccak256("WithdrawMUSD(uint256 amount,address borrower,address recipient,uint256 nonce,uint256 deadline)");

    address public immutable musd;
    mapping(address => uint256) private nonces;
    mapping(address => uint256) public troveDebt;
    mapping(address => uint256) public troveColl;
    mapping(address => bool) public troveActive;
    uint256 public mintShortfall;

    constructor(address musd_) { musd = musd_; }

    function getNonce(address user) external view returns (uint256) { return nonces[user]; }
    function setMintShortfall(uint256 value) external { mintShortfall = value; }

    function openTroveWithSignature(
        uint256 _debtAmount,
        address,
        address,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external payable {
        _verifySignature(OPEN_TROVE_TYPEHASH, abi.encode(msg.value, _debtAmount, _borrower, _recipient), _borrower, _signature, _deadline);
        require(!troveActive[_borrower], "BorrowerOps: Trove is active");
        require(msg.value > 0, "BorrowerOps: no collateral");
        troveActive[_borrower] = true;
        troveColl[_borrower] = msg.value;
        troveDebt[_borrower] = _debtAmount;
        IMintable(musd).mint(_recipient, _debtAmount - mintShortfall);
    }

    function withdrawMUSDWithSignature(
        uint256 _amount,
        address,
        address,
        address _borrower,
        address _recipient,
        bytes memory _signature,
        uint256 _deadline
    ) external {
        _verifySignature(WITHDRAW_MUSD_TYPEHASH, abi.encode(_amount, _borrower, _recipient), _borrower, _signature, _deadline);
        require(troveActive[_borrower], "BorrowerOps: Trove does not exist or is closed");
        require(_amount > 0, "BorrowerOps: Debt increase requires non-zero debtChange");
        troveDebt[_borrower] += _amount;
        IMintable(musd).mint(_recipient, _amount - mintShortfall);
    }

    function _verifySignature(bytes32 _typeHash, bytes memory _data, address _borrower, bytes memory _signature, uint256 _deadline) internal {
        require(block.timestamp <= _deadline, "Signature expired");
        bytes32 structHash = keccak256(abi.encodePacked(_typeHash, _data, nonces[_borrower], _deadline));
        bytes32 domain = keccak256(abi.encode(
            DOMAIN_TYPEHASH, keccak256("BorrowerOperationsSignatures"), keccak256("1"), block.chainid, address(this)
        ));
        bytes32 digest = keccak256(abi.encodePacked("\x19\x01", domain, structHash));
        require(_signature.length == 65, "ECDSA: invalid signature length");
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(_signature, 0x20))
            s := mload(add(_signature, 0x40))
            v := byte(0, mload(add(_signature, 0x60)))
        }
        address recovered = ecrecover(digest, v, r, s);
        require(recovered != address(0) && recovered == _borrower, "BorrowerOperationsSignatures: Invalid signature");
        nonces[_borrower]++;
    }
}
