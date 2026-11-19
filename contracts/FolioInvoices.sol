// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface ISettlementToken {
    function transferFrom(address payer, address recipient, uint256 amount) external returns (bool);
}

/// @notice One fixed-token payment per invoice, settled directly to its issuer.
contract FolioInvoices {
    enum State { Missing, Open, Paid, Cancelled }

    struct Invoice {
        address issuer;
        uint64 dueAt;
        State state;
        address payer;
        uint64 paidAt;
        uint64 paidBlock;
        uint128 amount;
        bytes32 memoHash;
    }

    ISettlementToken public token;
    uint256 public nextId = 1;
    mapping(uint256 => Invoice) public invoices;
    mapping(address => uint256[]) private issued;

    error InvalidInvoice();
    error InvoiceClosed();
    error InvoiceExpired();
    error NotIssuer();
    error SelfPayment();
    error TransferFailed();

    event InvoiceCreated(uint256 indexed id, address indexed issuer, uint128 amount, bytes32 memoHash);
    event InvoicePaid(uint256 indexed id, address indexed payer, address indexed issuer, uint128 amount);
    event InvoiceCancelled(uint256 indexed id);

    constructor(address settlementToken) {
        if (settlementToken.code.length == 0) revert InvalidInvoice();
        token = ISettlementToken(settlementToken);
    }

    function createInvoice(uint128 amount, uint64 dueAt, bytes32 memoHash) external returns (uint256 id) {
        if (amount == 0 || dueAt <= block.timestamp || memoHash == bytes32(0)) revert InvalidInvoice();
        id = nextId++;
        invoices[id] = Invoice(msg.sender, dueAt, State.Open, address(0), 0, 0, amount, memoHash);
        issued[msg.sender].push(id);
        emit InvoiceCreated(id, msg.sender, amount, memoHash);
    }

    function invoiceCount(address issuer) external view returns (uint256) {
        return issued[issuer].length;
    }

    function invoiceIds(address issuer, uint256 offset, uint256 limit) external view returns (uint256[] memory ids) {
        uint256 length = issued[issuer].length;
        if (offset >= length) return new uint256[](0);
        uint256 count = length - offset;
        if (count > limit) count = limit;
        if (count > 50) count = 50;
        ids = new uint256[](count);
        for (uint256 i; i < count; ++i) {
            ids[i] = issued[issuer][length - 1 - offset - i];
        }
    }

    function payInvoice(uint256 id) external {
        Invoice storage invoice = invoices[id];
        if (invoice.state != State.Open) revert InvoiceClosed();
        if (block.timestamp >= invoice.dueAt) revert InvoiceExpired();
        if (msg.sender == invoice.issuer) revert SelfPayment();

        invoice.state = State.Paid;
        invoice.payer = msg.sender;
        invoice.paidAt = uint64(block.timestamp);
        invoice.paidBlock = uint64(block.number);
        if (!token.transferFrom(msg.sender, invoice.issuer, invoice.amount)) revert TransferFailed();
        emit InvoicePaid(id, msg.sender, invoice.issuer, invoice.amount);
    }

    function cancelInvoice(uint256 id) external {
        Invoice storage invoice = invoices[id];
        if (msg.sender != invoice.issuer) revert NotIssuer();
        if (invoice.state != State.Open) revert InvoiceClosed();
        invoice.state = State.Cancelled;
        emit InvoiceCancelled(id);
    }
}
