// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Strings.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/ReentrancyGuardUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC721/extensions/ERC721EnumerableUpgradeable.sol";
import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

interface IDistributor {
    function claim(uint8 categoryId) external;
}

contract Staking is
    ERC721BurnableUpgradeable,
    ERC721EnumerableUpgradeable,
    OwnableUpgradeable,
    ReentrancyGuardUpgradeable
{
    using SafeERC20 for IERC20;
    using ECDSA for bytes32;
    using MessageHashUtils for bytes32;

    uint256 private _nextId;
    IERC20 public token;

    // Staking Tiers
    uint256 public constant TIER1_MIN = 50 ether;
    uint256 public constant TIER2_MIN = 200 ether;
    uint256 public constant TIER3_MIN = 1000 ether;

    uint256 public constant DENOM = 10000;

    // Staking Durations
    enum StakingDuration {
        FLEXI,
        DAYS_30,
        DAYS_180,
        DAYS_365
    }

    // Compound Frequencies
    enum CompoundFrequency {
        WEEKLY,
        DAILY,
        HOURLY
    }

    // Duration in seconds
    mapping(StakingDuration => uint256) public durationInSeconds;

    struct RewardRate {
        uint256 rate; // APY in basis points
        CompoundFrequency compoundFrequency;
    }

    mapping(uint256 => mapping(StakingDuration => RewardRate))
        public rewardRates;

    // Staking information structure
    struct StakeInfo {
        address owner;
        uint256 amount;
        uint256 startTime;
        uint256 endTime;
        uint8 tier;
        uint8 duration;
        uint256 lastClaimedAt;
        bool isActive;
        uint256 claimedRewards;
        uint256 tokenId;
    }

    mapping(uint256 => StakeInfo) public stakes;
    mapping(uint256 => uint256) public lastClaimedAt;

    uint256 public totalStaked;
    uint256 public totalClaimedRewards;

    bool public unlockAll;

    address public rewardsOperator;

    mapping(uint256 => uint256) public claims;
    mapping(address => uint256) public bonuses;

    // Events
    event Staked(
        address indexed user,
        uint256 tokenId,
        uint256 amount,
        uint256 startTime,
        uint256 endTime,
        uint256 tier,
        uint8 duration
    );

    event Unstaked(address indexed user, uint256 tokenId, uint256 amount);

    event RewardClaimed(
        address indexed user,
        uint256 tokenId,
        uint256 cid,
        uint256 rewards
    );

    event BonusClaimed(address indexed user, uint256 cid, uint256 rewards);

    /// @custom:oz-upgrades-unsafe-allow constructor
    constructor() {
        _disableInitializers();
    }

    function initialize(
        address token_,
        address rewardsOperator_
    ) external initializer {
        _nextId = 1;
        __ERC721_init("sDCAI", "sDCAI");
        __ERC721Burnable_init();
        __Ownable_init(msg.sender);
        __ReentrancyGuard_init();
        __ERC721Enumerable_init();
        token = IERC20(token_);

        // Set durations in seconds
        durationInSeconds[StakingDuration.FLEXI] = 0; // No fixed duration
        durationInSeconds[StakingDuration.DAYS_30] = 30 days;
        durationInSeconds[StakingDuration.DAYS_180] = 180 days;
        durationInSeconds[StakingDuration.DAYS_365] = 365 days;

        // Set reward rates for different tiers and durations

        // Tier 1: 50-199 tokens
        rewardRates[1][StakingDuration.FLEXI] = RewardRate(
            188,
            CompoundFrequency.WEEKLY
        ); // 1.88%
        rewardRates[1][StakingDuration.DAYS_30] = RewardRate(
            300,
            CompoundFrequency.WEEKLY
        ); // 3%
        rewardRates[1][StakingDuration.DAYS_180] = RewardRate(
            400,
            CompoundFrequency.WEEKLY
        ); // 4%
        rewardRates[1][StakingDuration.DAYS_365] = RewardRate(
            1000,
            CompoundFrequency.WEEKLY
        ); // 10%

        // Tier 2: 200-999 tokens
        rewardRates[2][StakingDuration.FLEXI] = RewardRate(
            188,
            CompoundFrequency.DAILY
        ); // 1.88%
        rewardRates[2][StakingDuration.DAYS_30] = RewardRate(
            500,
            CompoundFrequency.DAILY
        ); // 5%
        rewardRates[2][StakingDuration.DAYS_180] = RewardRate(
            600,
            CompoundFrequency.DAILY
        ); // 6%
        rewardRates[2][StakingDuration.DAYS_365] = RewardRate(
            1500,
            CompoundFrequency.DAILY
        ); // 15%

        // Tier 3: 1000+ tokens
        rewardRates[3][StakingDuration.FLEXI] = RewardRate(
            188,
            CompoundFrequency.HOURLY
        ); // 1.88%
        rewardRates[3][StakingDuration.DAYS_30] = RewardRate(
            600,
            CompoundFrequency.HOURLY
        ); // 6%
        rewardRates[3][StakingDuration.DAYS_180] = RewardRate(
            800,
            CompoundFrequency.HOURLY
        ); // 8%
        rewardRates[3][StakingDuration.DAYS_365] = RewardRate(
            2000,
            CompoundFrequency.HOURLY
        ); // 20%*/

        rewardsOperator = rewardsOperator_;
    }

    function determineTier(uint256 amount) public pure returns (uint8) {
        if (amount >= TIER3_MIN) {
            return 3;
        } else if (amount >= TIER2_MIN) {
            return 2;
        } else if (amount >= TIER1_MIN) {
            return 1;
        } else {
            return 0; // Invalid tier
        }
    }

    function stake(uint256 amount, uint8 duration) external nonReentrant {
        // Determine tier based on amount
        uint8 tier = determineTier(amount);
        require(tier > 0, "Invalid staking tier");

        // Calculate end time based on duration
        uint256 endTime = duration == 0
            ? 0
            : block.timestamp + durationInSeconds[StakingDuration(duration)];

        // Transfer tokens from user to contract
        token.safeTransferFrom(msg.sender, address(this), amount);

        // Mint a receipt NFT for the stake
        uint256 tokenId = _nextId++;
        _mint(msg.sender, tokenId);

        // Create stake info
        stakes[tokenId] = StakeInfo({
            owner: msg.sender,
            amount: amount,
            startTime: block.timestamp,
            endTime: endTime,
            tier: tier,
            duration: duration,
            lastClaimedAt: 0,
            isActive: true,
            claimedRewards: 0,
            tokenId: tokenId
        });

        totalStaked += amount;

        emit Staked(
            msg.sender,
            tokenId,
            amount,
            block.timestamp,
            endTime,
            tier,
            duration
        );
    }

    function claimReward(
        uint256 tokenId,
        uint256 amount,
        uint256 cid,
        bytes memory signature
    ) external nonReentrant {
        address owner = ownerOf(tokenId);
        StakeInfo storage stakeInfo = stakes[tokenId];

        require(claims[cid] == 0, "Already claimed");

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encodePacked(amount, "-", cid, "-", tokenId))
                    .toEthSignedMessageHash()
            )
        );

        // Recover signer from signature
        address signer = messageHash.recover(signature);
        require(signer == rewardsOperator, "Invalid signature");

        claims[cid] = amount;

        // Update last claim time
        stakeInfo.lastClaimedAt = block.timestamp;
        stakeInfo.claimedRewards += amount;

        // Transfer rewards to the user
        token.safeTransfer(owner, amount);

        emit RewardClaimed(owner, tokenId, cid, amount);
    }

    function claimBonus(
        uint256 amount,
        uint256 cid,
        bytes memory signature
    ) external nonReentrant {
        address recipient = msg.sender;

        require(claims[cid] == 0, "Already claimed");

        bytes32 messageHash = keccak256(
            abi.encodePacked(
                "\x19Ethereum Signed Message:\n32",
                keccak256(abi.encodePacked(amount, "-", cid, "-0"))
                    .toEthSignedMessageHash()
            )
        );

        // Recover signer from signature
        address signer = messageHash.recover(signature);
        require(signer == rewardsOperator, "Invalid signature");

        claims[cid] = amount;

        bonuses[recipient] = bonuses[recipient] + amount;

        // Transfer rewards to the user
        token.safeTransfer(recipient, amount);

        emit BonusClaimed(recipient, cid, amount);
    }

    function unstake(uint256 tokenId) external nonReentrant {
        require(ownerOf(tokenId) == msg.sender, "Not the owner of receipt");
        StakeInfo storage stakeInfo = stakes[tokenId];
        require(
            block.timestamp >= stakeInfo.endTime || unlockAll,
            "Not matured yet"
        );
        require(stakeInfo.isActive, "Stake not active");

        uint256 amount = stakeInfo.amount;

        stakeInfo.isActive = false;

        totalStaked -= amount;

        token.safeTransfer(msg.sender, amount);

        emit Unstaked(msg.sender, tokenId, amount);
    }

    function getAllPositions(
        address account
    ) external view returns (StakeInfo[] memory stakeInfos) {
        uint256 total = balanceOf(account);
        stakeInfos = new StakeInfo[](total);

        for (uint256 i = 0; i < total; i++) {
            stakeInfos[i] = stakes[tokenOfOwnerByIndex(account, i)];
        }
    }

    function withdrawExcessRewards(uint256 amount) external onlyOwner {
        token.safeTransfer(owner(), amount);
    }

    function _increaseBalance(
        address account,
        uint128 value
    ) internal override(ERC721EnumerableUpgradeable, ERC721Upgradeable) {
        super._increaseBalance(account, value);
    }

    function supportsInterface(
        bytes4 interfaceId
    )
        public
        view
        override(ERC721EnumerableUpgradeable, ERC721Upgradeable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }

    function _update(
        address to,
        uint256 tokenId,
        address auth
    )
        internal
        override(ERC721EnumerableUpgradeable, ERC721Upgradeable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function setUnlockAll(bool unlockAll_) external onlyOwner {
        unlockAll = unlockAll_;
    }

    function setRewardsOperator(address rewardsOperator_) external onlyOwner {
        rewardsOperator = rewardsOperator_;
    }

    function depositRewards(address distributor, uint8 categoryId) external {
        IDistributor(distributor).claim(categoryId);
    }
}
