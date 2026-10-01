// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title TaskHistory
/// @notice Stores a minimal, public history of workspace task actions.
contract TaskHistory {
    enum Action {
        Created,
        Updated,
        Deleted
    }

    struct TaskActionRecord {
        bytes16 taskId;
        bytes16 workspaceId;
        Action action;
        uint64 timestamp;
    }

    uint256 public constant MAX_PAGE_SIZE = 50;

    /// @notice The one account allowed to add records.
    address public immutable writer;

    /// @dev Each task has its own append-only list.
    mapping(bytes16 taskId => TaskActionRecord[] records) private _recordsByTask;

    error InvalidWriter();
    error UnauthorizedWriter();
    error ZeroIdentifier();
    error InvalidPageSize();

    /// @notice Contains only the four approved record values.
    event TaskActionRecorded(
        bytes16 indexed taskId,
        bytes16 indexed workspaceId,
        Action action,
        uint64 timestamp
    );

    modifier onlyWriter() {
        if (msg.sender != writer) {
            revert UnauthorizedWriter();
        }
        _;
    }

    constructor(address writerAddress) {
        if (writerAddress == address(0)) {
            revert InvalidWriter();
        }

        writer = writerAddress;
    }

    /// @notice Adds a task activity record. Only the configured writer can call this.
    /// @dev The timestamp is the block timestamp, not the original API request time.
    function recordTaskAction(
        bytes16 taskId,
        bytes16 workspaceId,
        Action action
    ) external onlyWriter {
        if (taskId == bytes16(0) || workspaceId == bytes16(0)) {
            revert ZeroIdentifier();
        }

        uint64 recordedAt = uint64(block.timestamp);

        TaskActionRecord memory record = TaskActionRecord({
            taskId: taskId,
            workspaceId: workspaceId,
            action: action,
            timestamp: recordedAt
        });

        _recordsByTask[taskId].push(record);

        emit TaskActionRecorded(
            taskId,
            workspaceId,
            action,
            recordedAt
        );
    }

    /// @notice Returns how many records exist for a task.
    function getRecordCount(bytes16 taskId)
        external
        view
        returns (uint256)
    {
        return _recordsByTask[taskId].length;
    }

    /// @notice Returns a bounded page of records for a task.
    /// @param taskId Task whose history is requested.
    /// @param offset Zero-based position of the first returned record.
    /// @param limit Number of records requested; maximum is MAX_PAGE_SIZE.
    function getHistory(
        bytes16 taskId,
        uint256 offset,
        uint256 limit
    ) external view returns (TaskActionRecord[] memory page) {
        if (limit == 0 || limit > MAX_PAGE_SIZE) {
            revert InvalidPageSize();
        }

        TaskActionRecord[] storage records = _recordsByTask[taskId];
        uint256 total = records.length;

        if (offset >= total) {
            return new TaskActionRecord[](0);
        }

        uint256 pageLength = total - offset;
        if (pageLength > limit) {
            pageLength = limit;
        }

        page = new TaskActionRecord[](pageLength);

        for (uint256 i = 0; i < pageLength; i++) {
            page[i] = records[offset + i];
        }
    }
}