import { hiveClient, addAsset } from './utils.js';
import { processComment, processVote, processReward, processClaim, processSnapPost, fetchMuteList } from './operations.js';
import { SPAM_USERS } from './constants.js';

export async function computeWrapped(username, from = new Date('2025-01-01'), to = new Date('2026-01-01')) {
  console.log(`[compute] Starting wrapped computation for @${username} from ${from.toISOString()} to ${to.toISOString()}`);

  // Fetch user's mute list (single call per report)
  const muteSet = await fetchMuteList(username);
  console.log(`[compute] Fetched mute list for @${username}, muted users: ${muteSet.size}`);

  // Initialize counters
  let posts = 0;
  let votes = 0;
  let rewardEvents = 0;
  let claimEvents = 0;
  let snapPostsCount = 0;
  let witnessVotes = 0;
  let proposalVotes = 0;
  const totals = { hbd: 0, vests: 0 };
  const postRewards = { HBD: 0, VESTS: 0 }; // Track only post rewards
  let scannedOps = 0;

  // Story metrics
  const postsByMonth = new Map();
  const postsByDay = new Map();
  const tagsUsed = new Set();
  const topTags = new Map();
  const topVotedAuthors = new Map();
  const topDownvotedAuthors = new Map();
  const topBuddies = new Map();
  const mutualInteractions = new Map(); // Track mutual interactions for filtering
  const snapPosts = new Set(); // Track Snap posts
  let comments = 0;
  let downvotes = 0;
  
  // New metrics
  let totalVotesOnPosts = 0; // sum of votes received on posts
  let totalCommentsOnPosts = 0; // sum of comments received on posts
  let totalReceivedVotes = 0; // total votes received from others
  let totalOutgoingVotes = 0; // total votes given to others
  
  // Witness metrics
  let witnessRewards = { HBD: 0, VESTS: 0 };
  let blocksProduced = 0;

  const pageSize = 1000;
  const maxPages = 5000;
  let concurrency = 4;
  let start = -1; // Will be updated to latest operation index on first run
  let reachedBefore2025 = false;
  let batchStart = 0;

  // Fetch global properties for VESTS to HP conversion
  const globalProps = await hiveClient.database.getDynamicGlobalProperties();
  const totalVestingFund = parseFloat(globalProps.total_vesting_fund_hive.split(' ')[0]);
  const totalVestingShares = parseFloat(globalProps.total_vesting_shares.split(' ')[0]);
  const vestsToHpRatio = totalVestingFund / totalVestingShares;

  // Get the latest operation index to start pagination
  const latestHistory = await hiveClient.database.getAccountHistory(username, -1, 1);
  if (latestHistory.length > 0) {
    const latestOp = latestHistory[0];
    const latestTs = new Date(latestOp[1].timestamp);
    
    // Check if the latest operation is before our target date range
    if (latestTs < from) {
      console.log(`[compute] @${username} latest operation from ${latestTs.toISOString()} is before 2025, no data to process`);
      return { stats: null, error: 'No operations found in 2025' };
    }
    
    start = latestOp[0]; // Start from the latest operation index
    console.log(`[compute] Starting pagination for @${username} from index ${start} (${latestTs.toISOString()})`);
    
    // If start is too low for concurrent requests, reduce concurrency
    if (start < concurrency * pageSize) {
      const maxConcurrentRequests = Math.floor(start / (pageSize - 1));
      const actualConcurrency = Math.max(1, Math.min(concurrency, maxConcurrentRequests));
      console.log(`[compute] @${username} start ${start} is too low for concurrency ${concurrency}, using concurrency ${actualConcurrency}`);
      concurrency = actualConcurrency;
    }
  } else {
    console.log(`[compute] No account history found for @${username}`);
    return { stats: null, error: 'No account history found' };
  }

  // Process account history with concurrency
  while (start >= 0 && batchStart < maxPages) {
    if (reachedBefore2025) break;

    // Calculate the next batch of start indices (non-overlapping)
    const batchStarts = [];
    
    // Adjust pageSize if start is below 1000 to prevent API errors
    const adjustedPageSize = start < 1000 ? start + 1 : pageSize;
    
    for (let i = 0; i < concurrency && batchStart + i < maxPages; i++) {
      batchStarts.push(start - (i * adjustedPageSize));
    }

    // Make concurrent requests
    const pages = await Promise.all(
      batchStarts.map(s => hiveClient.database.getAccountHistory(username, s, adjustedPageSize))
    );

    // Process each page in the batch and find the oldest index
    let minIndexInBatch = Infinity;
    for (let i = 0; i < pages.length; i++) {
      const history = pages[i];
      if (!history.length) continue;

      // Track the oldest index in this batch
      const oldestIndexInPage = history[0][0];
      minIndexInBatch = Math.min(minIndexInBatch, oldestIndexInPage);

      const oldestTs = history[0][1].timestamp;
      const newestTs = history[history.length - 1][1].timestamp;
      const pageIdx = batchStart + i;

      if ((pageIdx + 1) % 10 === 0 || pageIdx === 0) {
        console.log(`[compute] @${username} page ${pageIdx + 1}/${maxPages} — ops ${scannedOps + 1}-${scannedOps + history.length} — time range ${oldestTs} … ${newestTs}`);
      }

      for (const [, item] of history) {
        scannedOps += 1;
        const ts = new Date(item.timestamp);
        if (Number.isNaN(ts.getTime())) continue;

        if (ts < from) {
          reachedBefore2025 = true;

          continue;
        }
        if (ts >= to) continue;

        const [opType, opValue] = item.op;
        const monthKey = `${ts.getFullYear()}-${String(ts.getMonth() + 1).padStart(2, '0')}`;

        // Process operations using dedicated handlers
        if (opType === 'comment') {
          if (username === 'jesta') {
            console.log(`[compute] @${username} Processing comment operation from ${ts.toISOString()}:`, JSON.stringify(opValue, null, 2));
          }
          const result = processComment(opValue, username, monthKey, postsByMonth, postsByDay, tagsUsed, topTags, comments, topBuddies, totalCommentsOnPosts, mutualInteractions, muteSet, ts);
          posts += result.posts;  
          comments += result.comments;
          totalCommentsOnPosts += result.totalCommentsOnPosts;
          
          // Check if this is a Snap post
          snapPostsCount += processSnapPost(opValue, username, snapPosts);
        } else if (opType === 'vote') {
          const result = processVote(opValue, username, votes, downvotes, topVotedAuthors, topDownvotedAuthors, totalVotesOnPosts);
          votes += result.votes;
          downvotes += result.downvotes;
          totalVotesOnPosts += result.totalVotesOnPosts;
          
          // Track total received and outgoing votes
          const author = opValue?.author;
          const voter = opValue?.voter;
          const weight = opValue?.weight || 0;
          
          if (weight > 0) {
            if (voter === username && author !== username) {
              totalOutgoingVotes += 1;
            } else if (author === username && voter !== username) {
              totalReceivedVotes += 1;
            }
          }
        } else if (opType === 'author_reward' || opType === 'curation_reward') {
          rewardEvents += processReward(opType, opValue, totals);
          
          // Track post rewards separately (only author_reward counts as post rewards)
          if (opType === 'author_reward') {
            addAsset(postRewards, opValue?.hbd_payout);
            addAsset(postRewards, opValue?.vesting_payout);
          }
        } else if (opType === 'claim_reward_balance') {
          claimEvents += processClaim();
        } else if (opType === 'account_witness_vote') {
          // Track witness votes
          if (opValue?.account === username) {
            witnessVotes += 1;
          }
        } else if (opType === 'update_proposal_votes') {
          // Track proposal votes
          if (opValue?.voter === username) {
            proposalVotes += 1;
          }
        } else if (opType === 'producer_reward') {
          // Track witness rewards and block production
          if (opValue?.producer === username) {
            witnessRewards.HBD += parseFloat(opValue.hbd_payout?.split(' ')[0] || 0);
            witnessRewards.VESTS += parseFloat(opValue.vesting_payout?.split(' ')[0] || 0);
            blocksProduced += 1;
          }
        }
      }

      if (reachedBefore2025) break;
    }

    // Update start for next batch using the minimum index from this batch
    if (minIndexInBatch !== Infinity) {
      // Start next batch from the oldest index found in this batch
      const newStart = minIndexInBatch - 1;
      
      // Ensure start meets API constraint: start >= limit-1
      if (newStart < pageSize - 1) {
        console.log(`[compute] Reached start ${newStart} which is below limit ${pageSize - 1}, stopping pagination`);
        break;
      }
      
      start = newStart;
      batchStart += concurrency;
      
      // Debug log to track pagination progress
      console.log(`[compute] Batch ${Math.floor(batchStart/concurrency) + 1}: Updated start to ${start}, minIndexInBatch was ${minIndexInBatch}, reachedBefore2025: ${reachedBefore2025}`);
    } else {
      console.log(`[compute] No valid pages in batch, stopping pagination`);
      break; // No valid pages in this batch
    }

    if (reachedBefore2025) {
      console.log(`[compute] Stopping pagination because reachedBefore2025 is true`);
      break;
    }
  }

  // Calculate story insights
  const busiestMonth = Object.entries(postsByMonth).sort((a, b) => b[1] - a[1])[0] || null;
  
  // Top 5 voted authors from Map (more memory efficient)
  const topVotedAuthorsList = Array.from(topVotedAuthors.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([author, count]) => ({ author, votes: count }));
  
  // Top 5 buddies from Map (more memory efficient) - include all users
  const topCommentedAuthors = [];
  
  for (const [author, count] of topBuddies.entries()) {
    // Check if not in spam list
    if (SPAM_USERS.has(author.toLowerCase())) {
      continue;
    }
    
    // Add all users (no reputation check)
    topCommentedAuthors.push({ author, count });
  }
  
  // Sort by interaction count
  topCommentedAuthors.sort((a, b) => b.count - a.count);
  const finalBuddies = topCommentedAuthors.slice(0, 5).map(({ author, count }) => ({ author, comments: count }));
  
  const topDownvotedAuthor = Array.from(topDownvotedAuthors.entries())
    .sort((a, b) => b[1] - a[1])[0] || null;

  // Calculate new metrics
  const uniqueTagsCount = tagsUsed.size;
  const topCommunities = Array.from(topTags.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([tag, count]) => ({ community: tag, posts: count }));
  
  // Calculate posting streak
  const sortedDays = Array.from(postsByDay.keys()).sort();
  let longestStreak = 0;
  let currentStreak = 0;
  let prevDay = null;
  
  for (const day of sortedDays) {
    const dayDate = new Date(day);
    if (!prevDay) {
      currentStreak = 1;
    } else {
      const prevDate = new Date(prevDay);
      const diffDays = Math.floor((dayDate - prevDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 1) {
        currentStreak += 1;
      } else {
        currentStreak = 1;
      }
    }
    longestStreak = Math.max(longestStreak, currentStreak);
    prevDay = day;
  }
  
  console.log(`[compute] Finished scan for @${username} — total ops: ${scannedOps}, posts: ${posts}, votes: ${votes}`);
  console.log(`[compute] Totals — HBD: ${totals.HBD}, VESTS: ${totals.VESTS}`);

  const totalHp = (totals.VESTS + witnessRewards.VESTS) * vestsToHpRatio;
  const postVests = postRewards.VESTS || 0; // Handle undefined
  const postHp = postVests * vestsToHpRatio; // HP from posts only
  const postHbd = postRewards.HBD || 0; // HBD from posts only
  const witnessHp = witnessRewards.VESTS * vestsToHpRatio; // HP from witness rewards
  console.log(`[compute] Total HP: ${totalHp}, Post HP: ${postHp}, Post HBD: ${postHbd}, Witness HP: ${witnessHp}, Blocks: ${blocksProduced}, Posts: ${posts}`);
  
  // Calculate averages (now that totalHp is available)
  const avgVotesPerPost = posts > 0 ? Math.round((totalVotesOnPosts / posts) * 10) / 10 : 0;
  const avgCommentsPerPost = posts > 0 ? Math.round((totalCommentsOnPosts / posts) * 10) / 10 : 0;
  const hpEfficiency = posts > 0 ? Math.round((postHp / posts) * 100) / 100 : 0; // HP per post
  const hbdEfficiency = posts > 0 ? Math.round((postHbd / posts) * 100) / 100 : 0; // HBD per post
  const totalGovernanceActions = witnessVotes + proposalVotes;
  console.log(`[compute] Reward efficiency calculation: hpEfficiency=${hpEfficiency}, hbdEfficiency=${hbdEfficiency}, posts=${posts}`);
  console.log(`[compute] Governance participation: witnessVotes=${witnessVotes}, proposalVotes=${proposalVotes}, total=${totalGovernanceActions}`);

  return {
    username,
    from,
    to,
    scannedOps,
    posts,
    comments,
    votes,
    downvotes,
    rewardEvents,
    claimEvents,
    totalHbd: totals.HBD,
    totalHp: postHp, // Only author rewards, not curation rewards
    // Witness metrics
    witnessHp,
    witnessHbd: witnessRewards.HBD,
    blocksProduced,
    // Story insights
    busiestMonth: busiestMonth ? { month: busiestMonth[0], posts: busiestMonth[1] } : null,
    topVotedAuthors: topVotedAuthorsList,
    topCommentedAuthors: finalBuddies,
    topDownvotedAuthor: topDownvotedAuthor ? { author: topDownvotedAuthor[0], downvotes: topDownvotedAuthor[1] } : null,
    // New metrics
    uniqueTagsCount,
    topCommunities,
    longestStreak,
    avgVotesPerPost,
    avgCommentsPerPost,
    hpEfficiency,
    hbdEfficiency,
    totalReceivedVotes,
    totalOutgoingVotes,
    snapPostsCount,
    // Governance metrics
    witnessVotes,
    proposalVotes,
    totalGovernanceActions,
  };
}
