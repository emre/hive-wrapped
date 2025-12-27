import { addAsset } from './utils.js';

const SNAP_ACCOUNT = 'peak.snaps';

// Process comment operations
export function processComment(opValue, username, monthKey, postsByMonth, postsByDay, tagsUsed, topTags, comments, topBuddies, totalCommentsOnPosts) {
  if (!opValue || typeof opValue.parent_author !== 'string') return { posts: 0, comments: 0, totalCommentsOnPosts: 0 };
  
  let postsDelta = 0;
  let commentsDelta = 0;
  let totalCommentsOnPostsDelta = 0;
  
  if (opValue.parent_author.length === 0) {
    // Top-level post
    postsDelta = 1;
    postsByMonth[monthKey] = (postsByMonth[monthKey] || 0) + 1;
    
    // Track posts per day (for streak) - use date string as key
    const ts = new Date(opValue.timestamp || Date.now());
    const dayKey = ts.toISOString().split('T')[0]; // YYYY-MM-DD
    postsByDay.set(dayKey, (postsByDay.get(dayKey) || 0) + 1);
    
    // Track tags from post metadata
    if (opValue.json_metadata) {
      try {
        const metadata = JSON.parse(opValue.json_metadata);
        if (metadata.tags && Array.isArray(metadata.tags)) {
          metadata.tags.forEach(tag => {
            if (typeof tag === 'string' && tag.length > 0) {
              tagsUsed.add(tag);
              topTags.set(tag, (topTags.get(tag) || 0) + 1);
            }
          });
        }
      } catch (e) {
        // Invalid JSON, ignore
      }
    }
  } else {
    // Reply/comment
    if (opValue.parent_author === username && opValue.author !== username) {
      // Comments received on your posts (from others)
      totalCommentsOnPostsDelta = 1;
    }
    
    if (opValue.parent_author !== username) {
      // Reply/comment on someone else's post (exclude self-comments)
      commentsDelta = 1;
      const author = opValue.parent_author;
      
      // Don't count @peak.snaps as a buddy - these are Snap posts
      if (author !== SNAP_ACCOUNT) {
        topBuddies.set(author, (topBuddies.get(author) || 0) + 1);
      }
    }
    
    // Track when others comment on your posts (reverse interaction)
    if (opValue.parent_author === username && opValue.author !== username) {
      const commenter = opValue.author;
      // Don't count @peak.snaps as a buddy
      if (commenter !== SNAP_ACCOUNT) {
        topBuddies.set(commenter, (topBuddies.get(commenter) || 0) + 1);
      }
    }
  }
  
  return { posts: postsDelta, comments: commentsDelta, totalCommentsOnPosts: totalCommentsOnPostsDelta };
}

// Process incoming votes (votes received on your posts)
export function processIncomingVotes(opValue, username, totalVotesOnPosts) {
  const author = opValue?.author;
  const voter = opValue?.voter;
  const weight = opValue?.weight || 0;
  
  let totalVotesOnPostsDelta = 0;
  
  // Track votes received on your posts (from others voting on your content)
  if (author === username && voter !== username && weight > 0) {
    totalVotesOnPostsDelta = 1;
  }
  
  return totalVotesOnPostsDelta;
}

// Process outgoing votes (votes you give to others)
export function processOutgoingVotes(opValue, username, votes, downvotes, topVotedAuthors, topDownvotedAuthors) {
  const author = opValue?.author;
  const voter = opValue?.voter;
  const weight = opValue?.weight || 0;
  
  let votesDelta = 0;
  let downvotesDelta = 0;
  
  // Only process votes you made (self-votes already excluded by voter check)
  if (voter !== username) {
    return { votes: 0, downvotes: 0 };
  }
  
  // Count votes given to others (exclude self-votes by checking author)
  if (weight > 0) {
    if (author !== username) {
      votesDelta = 1;
      // Add to favorite authors
      topVotedAuthors.set(author, (topVotedAuthors.get(author) || 0) + 1);
    }
  } else if (weight < 0) {
    if (author !== username) {
      downvotesDelta = 1;
      // Add to downvoted authors
      topDownvotedAuthors.set(author, (topDownvotedAuthors.get(author) || 0) + 1);
    }
  }
  
  return { votes: votesDelta, downvotes: downvotesDelta };
}

// Combined vote processor (for backward compatibility)
export function processVote(opValue, username, votes, downvotes, topVotedAuthors, topDownvotedAuthors, totalVotesOnPosts) {
  // Process incoming votes
  const totalVotesOnPostsDelta = processIncomingVotes(opValue, username, totalVotesOnPosts);
  
  // Process outgoing votes
  const { votes: votesDelta, downvotes: downvotesDelta } = processOutgoingVotes(
    opValue, username, votes, downvotes, topVotedAuthors, topDownvotedAuthors
  );
  
  return { votes: votesDelta, downvotes: downvotesDelta, totalVotesOnPosts: totalVotesOnPostsDelta };
}

// Process reward operations
export function processReward(opType, opValue, totals) {
  let rewardEventsDelta = 0;
  
  if (opType === 'author_reward') {
    rewardEventsDelta = 1;
    addAsset(totals, opValue?.hbd_payout);
    addAsset(totals, opValue?.vests_payout);
  } else if (opType === 'curation_reward') {
    rewardEventsDelta = 1;
    addAsset(totals, opValue?.reward);
  }
  
  return rewardEventsDelta;
}

// Process claim operations
export function processClaim() {
  return 1; // claimEventsDelta
}

// Process Snap posts (replies to @peak.snaps)
export function processSnapPost(opValue, username, snapPosts) {
  if (opValue.parent_author === SNAP_ACCOUNT && opValue.author === username) {
    snapPosts.add(opValue.permlink);
    return 1;
  }
  return 0;
}
