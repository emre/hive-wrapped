import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, MessageCircle, ThumbsUp, ThumbsDown, Wallet, PenLine, Calendar, Heart, Frown, Hash, Trophy, Zap, Camera, BarChart3, MessageSquare, TrendingUp, Shield, Vote } from 'lucide-react';
import type { HiveWrappedStats } from '../services/hive';

const SLIDE_DURATION = 5000; // 5 seconds per slide

const MONTH_NAMES: Record<string, string> = {
  '01': 'January',
  '02': 'February',
  '03': 'March',
  '04': 'April',
  '05': 'May',
  '06': 'June',
  '07': 'July',
  '08': 'August',
  '09': 'September',
  '10': 'October',
  '11': 'November',
  '12': 'December',
};

function formatMonth(monthKey: string): string {
  const [, month] = monthKey.split('-');
  return MONTH_NAMES[month] || monthKey;
}

function fmt(n: number, digits = 0) {
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: digits,
    minimumFractionDigits: digits,
  }).format(n);
}

function getAvatarUrl(username: string): string {
  return `https://images.hive.blog/u/${username}/avatar`;
}

type SlideProps = {
  stats: HiveWrappedStats;
};

function IntroSlide({ stats }: SlideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <img
        src={getAvatarUrl(stats.username)}
        alt={stats.username}
        className="w-24 h-24 rounded-full border-4 border-hive-red mb-4"
      />
      <div className="text-hive-red text-lg font-medium">@{stats.username}</div>
      <h1 className="text-4xl font-bold mt-6 text-white">Your year on Hive.</h1>
      <p className="text-purple-200/70 mt-4">Let's see what you've been up to in 2025</p>
    </div>
  );
}

function PostsSlide({ stats }: SlideProps) {
  const message = stats.posts > 50 
    ? "You're a content machine!" 
    : stats.posts > 10 
    ? "Nice work sharing your thoughts!" 
    : stats.posts > 0 
    ? "Quality over quantity, right?" 
    : "Time to start posting!";
  
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <div className="text-purple-300 text-sm uppercase tracking-wider mb-4">Total Posts</div>
        <div className="text-6xl font-bold text-white">{fmt(stats.posts)}</div>
        <div className="flex items-center justify-center gap-2 mt-6 text-hive-red text-2xl font-semibold">
          <PenLine className="w-8 h-8" />
          Posts Published
        </div>
        <p className="text-purple-200/70 mt-4">{message}</p>
      </div>
    </div>
  );
}

function VotesSlide({ stats }: SlideProps) {
  const message = stats.votes > 1000 
    ? "You're a voting powerhouse!" 
    : stats.votes > 100 
    ? "Spreading the love across Hive!" 
    : "Every vote counts!";
  
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <div className="text-purple-300 text-sm uppercase tracking-wider mb-4">Upvotes Given</div>
        <div className="text-6xl font-bold text-white">{fmt(stats.votes)}</div>
        <div className="flex items-center justify-center gap-2 mt-6 text-green-400 text-2xl font-semibold">
          <ThumbsUp className="w-8 h-8" />
          Upvotes
        </div>
        <p className="text-purple-200/70 mt-4">{message}</p>
      </div>
    </div>
  );
}

function CommentsSlide({ stats }: SlideProps) {
  const message = stats.comments > 100 
    ? "You love engaging with the community!" 
    : stats.comments > 20 
    ? "Great conversations happening!" 
    : "Join more discussions!";
  
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <div className="text-purple-300 text-sm uppercase tracking-wider mb-4">Comments Made</div>
        <div className="text-6xl font-bold text-white">{fmt(stats.comments)}</div>
        <div className="flex items-center justify-center gap-2 mt-6 text-blue-400 text-2xl font-semibold">
          <MessageCircle className="w-8 h-8" />
          Comments
        </div>
        <p className="text-purple-200/70 mt-4">{message}</p>
      </div>
    </div>
  );
}

function BusiestMonthSlide({ stats }: SlideProps) {
  if (!stats.busiestMonth) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="text-purple-200/70">No posts this year yet!</div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <div className="text-orange-300 text-sm uppercase tracking-wider mb-4">Most Productive Month</div>
        <div className="text-5xl font-bold text-orange-400">{formatMonth(stats.busiestMonth.month)}</div>
        <div className="flex items-center justify-center gap-2 mt-6 text-white text-2xl font-semibold">
          <Calendar className="w-8 h-8" />
          {stats.busiestMonth.posts} Posts
        </div>
        <p className="text-purple-200/70 mt-4">You were on fire this month!</p>
      </div>
    </div>
  );
}

function TopVotedAuthorsSlide({ stats }: SlideProps) {
  if (!stats.topVotedAuthors || stats.topVotedAuthors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="text-purple-200/70">No votes given this year!</div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <div className="text-pink-300 text-sm uppercase tracking-wider mb-6">Favorite Authors</div>
        <div className="space-y-2">
          {stats.topVotedAuthors.map((author, index) => (
            <div key={author.author} className="flex items-center gap-2 text-left">
              <div className="text-purple-400/50 text-xs font-mono w-5 text-right">#{index + 1}</div>
              <img
                src={getAvatarUrl(author.author)}
                alt={author.author}
                className="w-8 h-8 rounded-full border border-pink-500/50"
              />
              <div className="flex-1 min-w-0">
                <a 
                  href={`https://hive.blog/@${author.author}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white text-sm font-medium hover:text-pink-400 transition-colors truncate block"
                >
                  @{author.author}
                </a>
                <div className="text-pink-400 text-xs">{author.votes} votes</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-purple-200/70 mt-6">Your favorite creators!</p>
      </div>
    </div>
  );
}

function TopCommentedAuthorsSlide({ stats }: SlideProps) {
  if (!stats.topCommentedAuthors || stats.topCommentedAuthors.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="text-purple-200/70">No comments made this year!</div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <div className="text-cyan-300 text-sm uppercase tracking-wider mb-6">Top Buddies</div>
        <div className="space-y-2">
          {stats.topCommentedAuthors.map((buddy, index) => (
            <div key={buddy.author} className="flex items-center gap-2 text-left">
              <div className="text-purple-400/50 text-xs font-mono w-5 text-right">#{index + 1}</div>
              <img
                src={getAvatarUrl(buddy.author)}
                alt={buddy.author}
                className="w-8 h-8 rounded-full border border-cyan-500/50"
              />
              <div className="flex-1 min-w-0">
                <a 
                  href={`https://hive.blog/@${buddy.author}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-white text-sm font-medium hover:text-cyan-400 transition-colors truncate block"
                >
                  @{buddy.author}
                </a>
                <div className="text-cyan-400 text-xs">{buddy.comments} interactions</div>
              </div>
            </div>
          ))}
        </div>
        <p className="text-purple-200/70 mt-6">Your favorite people to chat with!</p>
      </div>
    </div>
  );
}

function DownvotesSlide({ stats }: SlideProps) {
  if (!stats.topDownvotedAuthor && stats.downvotes === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center px-8">
        <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
          <div className="text-6xl mb-4">😇</div>
          <div className="text-2xl font-bold text-white">No Downvotes!</div>
          <p className="text-purple-200/70 mt-4">You kept it positive all year!</p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <div className="text-gray-400 text-sm uppercase tracking-wider mb-4">The "Nemesis"</div>
        {stats.topDownvotedAuthor && (
          <>
            <img
              src={getAvatarUrl(stats.topDownvotedAuthor.author)}
              alt={stats.topDownvotedAuthor.author}
              className="w-20 h-20 rounded-full border-4 border-gray-500 mx-auto mb-4 grayscale"
            />
            <div className="text-3xl font-bold text-white">@{stats.topDownvotedAuthor.author}</div>
            <div className="flex items-center justify-center gap-2 mt-4 text-gray-400 text-xl font-semibold">
              <ThumbsDown className="w-6 h-6" />
              {stats.topDownvotedAuthor.downvotes} downvotes
            </div>
          </>
        )}
        <div className="flex items-center justify-center gap-2 mt-4 text-gray-500">
          <Frown className="w-5 h-5" />
          Total: {stats.downvotes} downvotes given
        </div>
      </div>
    </div>
  );
}

function RewardsSlide({ stats }: SlideProps) {
  const message = stats.totalHbd > 100 || stats.totalHp > 1000
    ? "Congrats, you're raking it in!" 
    : stats.totalHbd > 10 || stats.totalHp > 100
    ? "Your content paid off!" 
    : stats.totalHbd > 1 || stats.totalHp > 10
    ? "Money isn't everything!"
    : "Better luck next year!";

  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <div className="text-green-300 text-sm uppercase tracking-wider mb-4">Rewards Earned</div>
        <div className="text-4xl font-bold text-white mb-2">{fmt(stats.totalHbd, 2)} HBD</div>
        <div className="text-3xl font-bold text-green-400">{fmt(stats.totalHp, 2)} HP</div>
        <div className="flex items-center justify-center gap-2 mt-6 text-green-400 text-xl font-semibold">
          <Wallet className="w-6 h-6" />
          Total Earnings
        </div>
        <p className="text-purple-200/70 mt-4">{message}</p>
      </div>
    </div>
  );
}	

function UniqueTagsSlide({ stats }: SlideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <Hash className="w-12 h-12 text-hive-red mb-4 mx-auto" />
        <div className="text-4xl font-bold text-white mb-2">{stats.uniqueTagsCount}</div>
        <div className="text-hive-grey text-sm mb-4">Unique Tags Used</div>
        
        {stats.topCommunities && stats.topCommunities.length > 0 && (
          <div className="space-y-1 mb-4">
            <div className="text-hive-grey text-xs mb-2">Top Tags:</div>
            {stats.topCommunities.slice(0, 5).map((tag, index) => (
              <div key={tag.community} className="flex items-center justify-between text-xs">
                <a 
                  href={`https://hive.blog/created/${tag.community}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-hive-grey hover:text-white transition-colors"
                >
                  #{tag.community}
                </a>
                <span className="text-white font-medium">{tag.posts}</span>
              </div>
            ))}
          </div>
        )}
        
        <div className="text-hive-grey text-xs mt-2">
          {stats.uniqueTagsCount > 50 
            ? "You're a tagging master!" 
            : stats.uniqueTagsCount > 20 
            ? "Great variety in your content!"
            : "Building your tag portfolio"}
        </div>
      </div>
    </div>
  );
}

function SnapSlide({ stats }: SlideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <a 
          href={`https://peakd.com/@${stats.username}/snaps`}
          target="_blank"
          rel="noopener noreferrer"
          className="block hover:opacity-80 transition-opacity"
        >
          <Camera className="w-12 h-12 text-hive-red mb-4 mx-auto" />
          <div className="text-4xl font-bold text-white mb-2">{stats.snapPostsCount}</div>
          <div className="text-hive-grey text-sm">Snap Posts Created</div>
        </a>
        <div className="text-hive-grey text-xs mt-2">
          {stats.snapPostsCount > 50 
            ? "You're a Snap superstar!" 
            : stats.snapPostsCount > 20 
            ? "Great Snap game!"
            : stats.snapPostsCount > 5
            ? "Getting the hang of Snaps!"
            : "Start snapping to share moments!"}
        </div>
      </div>
    </div>
  );
}

function UpvotesBalanceSlide({ stats }: SlideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <div className="flex items-center justify-center gap-2 mb-6">
          <ThumbsUp className="w-8 h-8 text-hive-red" />
          <div className="text-2xl font-bold text-white">Upvotes Balance</div>
        </div>
        
        <div className="grid grid-cols-2 gap-4 mb-4">
          <div className="text-center">
            <div className="text-3xl font-bold text-green-400">{stats.totalReceivedVotes}</div>
            <div className="text-hive-grey text-xs">Received</div>
          </div>
          <div className="text-center">
            <div className="text-3xl font-bold text-blue-400">{stats.totalOutgoingVotes}</div>
            <div className="text-hive-grey text-xs">Given</div>
          </div>
        </div>
        
        <div className="text-hive-grey text-xs">
          {stats.totalReceivedVotes > stats.totalOutgoingVotes 
            ? "You receive more love than you give!" 
            : stats.totalOutgoingVotes > stats.totalReceivedVotes
            ? "You're generous with your upvotes!"
            : "Perfect upvote balance!"}
        </div>
      </div>
    </div>
  );
}

function AvgVotesPerPostSlide({ stats }: SlideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <BarChart3 className="w-12 h-12 text-hive-red mb-4 mx-auto" />
        <div className="text-4xl font-bold text-white mb-2">{stats.avgVotesPerPost}</div>
        <div className="text-hive-grey text-sm">Average Votes Per Post</div>
        <div className="text-hive-grey text-xs mt-2">
          {stats.avgVotesPerPost > 100 
            ? "Your content gets massive engagement!" 
            : stats.avgVotesPerPost > 50 
            ? "Great voter engagement!"
            : stats.avgVotesPerPost > 10
            ? "Building a loyal audience!"
            : "Every vote counts!"}
        </div>
      </div>
    </div>
  );
}

function AvgCommentsPerPostSlide({ stats }: SlideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <MessageSquare className="w-12 h-12 text-hive-red mb-4 mx-auto" />
        <div className="text-4xl font-bold text-white mb-2">{stats.avgCommentsPerPost}</div>
        <div className="text-hive-grey text-sm">Average Comments Per Post</div>
        <div className="text-hive-grey text-xs mt-2">
          {stats.avgCommentsPerPost > 50 
            ? "You spark amazing conversations!" 
            : stats.avgCommentsPerPost > 20 
            ? "Great discussion starter!"
            : stats.avgCommentsPerPost > 5
            ? "Building community engagement!"
            : "Comments make the community!"}
        </div>
      </div>
    </div>
  );
}

function RewardEfficiencySlide({ stats }: SlideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <TrendingUp className="w-12 h-12 text-hive-red mb-4 mx-auto" />
        <div className="space-y-4">
          <div>
            <div className="text-3xl font-bold text-white">{stats.hpEfficiency}</div>
            <div className="text-hive-grey text-sm">HP Per Post</div>
          </div>
          <div>
            <div className="text-3xl font-bold text-cyan-400">{stats.hbdEfficiency}</div>
            <div className="text-hive-grey text-sm">HBD Per Post</div>
          </div>
        </div>
        <div className="text-hive-grey text-xs mt-4">
          {(stats.hpEfficiency + stats.hbdEfficiency) > 100 
            ? "Incredible reward efficiency!" 
            : (stats.hpEfficiency + stats.hbdEfficiency) > 50 
            ? "Great content rewards!"
            : (stats.hpEfficiency + stats.hbdEfficiency) > 10
            ? "Building your rewards!"
            : "Every post adds value!"}
        </div>
      </div>
    </div>
  );
}

function StreakSlide({ stats }: SlideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <Zap className="w-12 h-12 text-hive-red mb-4 mx-auto" />
        <div className="text-4xl font-bold text-white mb-2">{stats.longestStreak} days</div>
        <div className="text-hive-grey text-sm">Longest Posting Streak</div>
        <div className="text-hive-grey text-xs mt-2">
          {stats.longestStreak > 30 
            ? "Incredible consistency!" 
            : stats.longestStreak > 7 
            ? "Great dedication!"
            : stats.longestStreak > 1
            ? "Building momentum!"
            : "Every post counts!"}
        </div>
      </div>
    </div>
  );
}

function SummarySlide({ stats }: SlideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center overflow-y-auto" style={{ minHeight: '500px' }}>
      <div className="flex items-center gap-3 mt-4 mb-2">
        <img
          src={getAvatarUrl(stats.username)}
          alt={stats.username}
          className="w-14 h-14 rounded-full border-2 border-hive-red"
        />
        <div className="text-left">
          <div className="text-hive-red text-lg font-medium">@{stats.username}</div>
          <h1 className="text-xl font-bold text-white">2025 Wrapped</h1>
        </div>
      </div>
      
      <div className="grid grid-cols-3 gap-2 w-full max-w-md text-left">
        <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
          <div className="text-purple-300 text-xs">Posts</div>
          <div className="text-white text-lg font-bold">{fmt(stats.posts)}</div>
        </div>
        <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
          <div className="text-purple-300 text-xs">Comments</div>
          <div className="text-white text-lg font-bold">{fmt(stats.comments)}</div>
        </div>
        <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
          <div className="text-purple-300 text-xs">Upvotes Given</div>
          <div className="text-white text-lg font-bold">{fmt(stats.votes)}</div>
        </div>
        <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
          <div className="text-cyan-300 text-xs">HP Earned</div>
          <div className="text-white text-lg font-bold">{fmt(stats.totalHp, 1)}</div>
        </div>
        <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
          <div className="text-cyan-300 text-xs">HBD Earned</div>
          <div className="text-white text-lg font-bold">{fmt(stats.totalHbd, 1)}</div>
        </div>
        <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
          <div className="text-cyan-300 text-xs">Votes Received</div>
          <div className="text-white text-lg font-bold">{fmt(stats.totalReceivedVotes)}</div>
        </div>
        <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
          <div className="text-yellow-300 text-xs">Unique Tags</div>
          <div className="text-white text-lg font-bold">{fmt(stats.uniqueTagsCount)}</div>
        </div>
        <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
          <div className="text-yellow-300 text-xs">Streak Days</div>
          <div className="text-white text-lg font-bold">{stats.longestStreak} days</div>
        </div>
        <div className="bg-white/5 backdrop-blur rounded-xl p-3 border border-white/10">
          <div className="text-yellow-300 text-xs">Governance actions</div>
          <div className="text-white text-lg font-bold">{fmt(stats.totalGovernanceActions)}</div>
        </div>
      </div>
      
      {stats.topCommentedAuthors && stats.topCommentedAuthors.length > 0 && (
        <div className="mt-4 w-full max-w-md">
          <div className="text-purple-300 text-xs mb-2">Top Buddies</div>
          <div className="flex justify-center gap-2">
            {stats.topCommentedAuthors.slice(0, 5).map((buddy) => (
              <a
                key={buddy.author}
                href={`https://hive.blog/@${buddy.author}`}
                target="_blank"
                rel="noopener noreferrer"
                title={`@${buddy.author} (${buddy.comments} interactions)`}
              >
                <img
                  src={getAvatarUrl(buddy.author)}
                  alt={buddy.author}
                  className="w-10 h-10 rounded-full border border-cyan-500/50 hover:border-cyan-400 transition-colors"
                />
              </a>
            ))}
          </div>
        </div>
      )}
      
      <p className="text-purple-200/70 mt-4 text-sm">Thanks for being part of Hive in 2025!</p>
      
      <div className="mt-4">
        Made with <Heart className="w-4 h-4 inline text-red-500" /> by 
        <a
          href="https://vote.hive.uno/@emrebeyler"
          target="_blank"
          rel="noopener noreferrer"
          className="text-white hover:text-white/80 transition-colors text-sm underline ml-1"
        >
          emrebeyler.
        </a>
      </div>
    </div>
  );
}

function GovernanceSlide({ stats }: SlideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <Shield className="w-12 h-12 text-hive-red mb-4 mx-auto" />
        <div className="text-4xl font-bold text-white mb-2">{stats.totalGovernanceActions}</div>
        <div className="text-hive-grey text-sm">Governance Actions</div>
        <div className="text-hive-grey text-xs mt-2">
          {stats.totalGovernanceActions > 10 
            ? "You're doing great! Active governance participant!" 
            : stats.totalGovernanceActions > 1
            ? "Thanks but you could do better!"
            : "Please participate in Hive governance!"}
        </div>
        <div className="mt-4 space-y-1 text-hive-grey text-xs">
          <div>Witness Votes: {stats.witnessVotes}</div>
          <div>Proposal Votes: {stats.proposalVotes}</div>
        </div>
      </div>
    </div>
  );
}

function WitnessSlide({ stats }: SlideProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center px-8">
      <div className="rounded-3xl bg-white/5 backdrop-blur border border-white/10 p-8 w-full max-w-sm">
        <Trophy className="w-12 h-12 text-hive-red mb-4 mx-auto" />
        <div className="text-4xl font-bold text-white mb-2">{stats.blocksProduced}</div>
        <div className="text-hive-grey text-sm">Blocks Produced</div>
        <div className="text-hive-grey text-xs mt-2">
          {stats.blocksProduced > 10000 
            ? "Amazing witness performance! Keeping Hive running!" 
            : stats.blocksProduced > 1000
            ? "Great contribution to Hive network!"
            : stats.blocksProduced > 100
            ? "Building your witness reputation!"
            : "Every block counts!"}
        </div>
      </div>
    </div>
  );
}

type StoryProps = {
  stats: HiveWrappedStats;
};

export default function Story({ stats }: StoryProps) {
  const [slideIndex, setSlideIndex] = useState(0);
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);

  const slides = [
    <IntroSlide key="intro" stats={stats} />,
    <PostsSlide key="posts" stats={stats} />,
    <CommentsSlide key="comments" stats={stats} />,
    <VotesSlide key="votes" stats={stats} />,
    <UpvotesBalanceSlide key="upvotesbalance" stats={stats} />,
    <BusiestMonthSlide key="busiest" stats={stats} />,
    <TopVotedAuthorsSlide key="topvoted" stats={stats} />,
    <TopCommentedAuthorsSlide key="topcommented" stats={stats} />,
    <DownvotesSlide key="downvotes" stats={stats} />,
    <RewardsSlide key="rewards" stats={stats} />,
    <UniqueTagsSlide key="tags" stats={stats} />,
    <SnapSlide key="snaps" stats={stats} />,
    <AvgVotesPerPostSlide key="avgvotes" stats={stats} />,
    <AvgCommentsPerPostSlide key="avgcomments" stats={stats} />,
    <RewardEfficiencySlide key="efficiency" stats={stats} />,
    <GovernanceSlide key="governance" stats={stats} />,
    ...(stats.blocksProduced > 0 ? [<WitnessSlide key="witness" stats={stats} />] : []),
    <StreakSlide key="streak" stats={stats} />,
    <SummarySlide key="summary" stats={stats} />,
  ];

  const totalSlides = slides.length;

  const goNext = useCallback(() => {
    setSlideIndex((prev) => {
      if (prev < totalSlides - 1) {
        return prev + 1;
      }
      return prev;
    });
    setProgress(0);
  }, [totalSlides]);

  const goPrev = useCallback(() => {
    setSlideIndex((prev) => {
      if (prev > 0) {
        return prev - 1;
      }
      return prev;
    });
    setProgress(0);
  }, []);

  // Auto-advance timer
  useEffect(() => {
    if (isPaused) return;

    const interval = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (100 / (SLIDE_DURATION / 50));
        if (next >= 100) {
          if (slideIndex < totalSlides - 1) {
            goNext();
            return 0;
          }
          return 100; // Keep at 100% on last slide
        }
        return next;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [isPaused, slideIndex, totalSlides, goNext]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goPrev();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goNext, goPrev]);

  return (
    <div 
      className="mt-8 rounded-2xl border border-purple-900/50 bg-gradient-to-b from-slate-950 via-purple-950/80 to-fuchsia-950/60 overflow-hidden"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      {/* Progress bar */}
      <div className="flex gap-1 p-3">
        {slides.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full bg-hive-grey/30 overflow-hidden"
          >
            <div
              className="h-full bg-hive-red transition-all duration-50"
              style={{
                width: i < slideIndex ? '100%' : i === slideIndex ? `${progress}%` : '0%',
              }}
            />
          </div>
        ))}
      </div>

      {/* Slide content */}
      <div className="flex-1 flex items-center justify-center relative px-6 py-8">
        {slides[slideIndex]}
        
        {/* Click zones for navigation */}
        <div 
          className="absolute left-0 top-0 bottom-0 w-1/3 cursor-pointer"
          onClick={goPrev}
        />
        <div 
          className="absolute right-0 top-0 bottom-0 w-1/3 cursor-pointer"
          onClick={goNext}
        />
      </div>

      {/* Navigation dots */}
      <div className="flex items-center justify-center gap-2 p-4">
        <button
          onClick={goPrev}
          disabled={slideIndex === 0}
          className="w-8 h-8 rounded-full bg-hive-grey/20 flex items-center justify-center disabled:opacity-30 disabled:cursor-not-allowed hover:bg-hive-grey/30 transition-colors"
        >
          <ChevronLeft className="w-4 h-4 text-white" />
        </button>

        <div className="flex gap-1">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => { setSlideIndex(i); setProgress(0); }}
              className={`w-2 h-2 rounded-full transition-all ${
                i === slideIndex ? 'bg-hive-red w-4' : 'bg-hive-grey/50 hover:bg-hive-grey'
              }`}
            />
          ))}
        </div>

        <button
          onClick={goNext}
          disabled={slideIndex === slides.length - 1}
          className="w-8 h-8 rounded-full bg-hive-red flex items-center justify-center disabled:opacity-50 hover:bg-hive-red/80 transition-colors"
        >
          <ChevronRight className="w-4 h-4 text-white" />
        </button>
      </div>
    </div>
  );
}
