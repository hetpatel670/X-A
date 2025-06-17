const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const fs = require('fs').promises;
const path = require('path');
const cron = require('node-cron');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// In-memory storage (use database in production)
let settings = {
  twitter: {
    apiKey: '',
    apiSecret: '',
    accessToken: '',
    accessTokenSecret: '',
    bearerToken: ''
  },
  ai: {
    baseUrl: '',
    apiKey: '',
    model: 'gpt-3.5-turbo'
  },
  posting: {
    enabled: false,
    interval: '0 */4 * * *', // Every 4 hours
    topics: []
  },
  replies: {
    enabled: false,
    replyToOwnPosts: true,
    replyToFollowing: true,
    maxRepliesPerHour: 10
  }
};

let activities = [];
let isAuthenticated = false;
let cronJobs = {};

// Twitter API simulation functions (replace with actual Twitter API)
class TwitterAPI {
  constructor(config) {
    this.config = config;
  }

  async verifyCredentials() {
    // Simulate API call
    if (!this.config.apiKey || !this.config.accessToken) {
      throw new Error('Invalid credentials');
    }
    return { screen_name: 'your_username', id: '123456789' };
  }

  async postTweet(content) {
    // Simulate posting
    const tweet = {
      id: Date.now().toString(),
      text: content,
      created_at: new Date().toISOString(),
      user: { screen_name: 'your_username' }
    };
    
    activities.unshift({
      id: Date.now(),
      type: 'post',
      content: content,
      timestamp: new Date().toISOString(),
      success: true,
      tweetId: tweet.id
    });

    return tweet;
  }

  async getMyTweets(count = 20) {
    // Simulate getting user's tweets
    return Array.from({ length: count }, (_, i) => ({
      id: (Date.now() - i * 1000).toString(),
      text: `Sample tweet ${i + 1}`,
      created_at: new Date(Date.now() - i * 1000 * 60).toISOString(),
      reply_count: Math.floor(Math.random() * 10),
      user: { screen_name: 'your_username' }
    }));
  }

  async getFollowingTweets(count = 50) {
    // Simulate getting timeline
    return Array.from({ length: count }, (_, i) => ({
      id: (Date.now() - i * 2000).toString(),
      text: `Tweet from following ${i + 1}`,
      created_at: new Date(Date.now() - i * 2000 * 60).toISOString(),
      user: { screen_name: `user_${i}` },
      in_reply_to_status_id: null
    }));
  }

  async replyToTweet(tweetId, content) {
    // Simulate reply
    const reply = {
      id: Date.now().toString(),
      text: content,
      created_at: new Date().toISOString(),
      in_reply_to_status_id: tweetId
    };

    activities.unshift({
      id: Date.now(),
      type: 'reply',
      content: content,
      timestamp: new Date().toISOString(),
      success: true,
      originalTweetId: tweetId,
      replyId: reply.id
    });

    return reply;
  }
}

// AI API simulation
class AIAPI {
  constructor(config) {
    this.config = config;
  }

  async generateContent(prompt, context = '') {
    // Simulate AI response
    const responses = [
      "Just had an amazing insight about the future of technology! 🚀",
      "The intersection of AI and creativity is fascinating. What are your thoughts?",
      "Building something new today. Progress feels good! 💪",
      "Sometimes the best ideas come from the simplest observations.",
      "Innovation happens when we challenge conventional thinking. 🧠"
    ];
    
    return responses[Math.floor(Math.random() * responses.length)];
  }

  async generateReply(originalTweet, context = '') {
    // Simulate AI reply generation
    const replies = [
      "Great point! I completely agree with your perspective.",
      "This is really interesting. Thanks for sharing!",
      "Love this insight! It made me think differently about the topic.",
      "Absolutely! This resonates with my experience too.",
      "Thanks for posting this - really valuable perspective!"
    ];
    
    return replies[Math.floor(Math.random() * replies.length)];
  }
}

// Initialize APIs
let twitterAPI = null;
let aiAPI = null;

// Routes
app.get('/api/status', (req, res) => {
  res.json({
    authenticated: isAuthenticated,
    services: {
      twitter: !!twitterAPI,
      ai: !!aiAPI
    },
    activities: activities.slice(0, 10)
  });
});

app.post('/api/settings', async (req, res) => {
  try {
    settings = { ...settings, ...req.body };
    
    // Initialize APIs with new settings
    if (settings.twitter.apiKey) {
      twitterAPI = new TwitterAPI(settings.twitter);
      try {
        await twitterAPI.verifyCredentials();
        isAuthenticated = true;
      } catch (error) {
        isAuthenticated = false;
        return res.status(400).json({ error: 'Twitter authentication failed' });
      }
    }

    if (settings.ai.apiKey) {
      aiAPI = new AIAPI(settings.ai);
    }

    // Update cron jobs
    updateCronJobs();

    res.json({ success: true, settings });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/settings', (req, res) => {
  // Return settings without sensitive data
  const safeSettings = {
    ...settings,
    twitter: {
      ...settings.twitter,
      apiKey: settings.twitter.apiKey ? '***' : '',
      apiSecret: settings.twitter.apiSecret ? '***' : '',
      accessToken: settings.twitter.accessToken ? '***' : '',
      accessTokenSecret: settings.twitter.accessTokenSecret ? '***' : '',
      bearerToken: settings.twitter.bearerToken ? '***' : ''
    },
    ai: {
      ...settings.ai,
      apiKey: settings.ai.apiKey ? '***' : ''
    }
  };
  res.json(safeSettings);
});

app.get('/api/activities', (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 20;
  const start = (page - 1) * limit;
  const end = start + limit;
  
  res.json({
    activities: activities.slice(start, end),
    total: activities.length,
    page,
    totalPages: Math.ceil(activities.length / limit)
  });
});

// API endpoints for frontend integration
app.post('/api/post', async (req, res) => {
  try {
    if (!twitterAPI || !aiAPI) {
      return res.status(400).json({ error: 'APIs not configured. Please set up your Twitter and AI credentials first.' });
    }

    const content = await aiAPI.generateContent('Generate an engaging social media post');
    const tweet = await twitterAPI.postTweet(content);
    
    res.json({ 
      success: true, 
      message: 'Post created successfully!',
      tweet: tweet
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reply', async (req, res) => {
  try {
    if (!twitterAPI || !aiAPI) {
      return res.status(400).json({ error: 'APIs not configured. Please set up your Twitter and AI credentials first.' });
    }

    await processReplies();
    res.json({ 
      success: true,
      message: 'Replies processed successfully!'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/config/ai', async (req, res) => {
  try {
    const { provider, baseUrl, apiKey, model } = req.body;
    
    if (!baseUrl || !apiKey || !model) {
      return res.status(400).json({ error: 'Missing required fields: baseUrl, apiKey, or model' });
    }

    // Update AI settings
    settings.ai = {
      provider: provider || 'custom',
      baseUrl: baseUrl,
      apiKey: apiKey,
      model: model
    };

    // Initialize AI API with new settings
    aiAPI = new AIAPI(settings.ai);

    res.json({ 
      success: true,
      message: 'AI configuration saved successfully!'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/test', async (req, res) => {
  try {
    if (!twitterAPI) {
      return res.status(400).json({ error: 'Twitter API not configured' });
    }

    const credentials = await twitterAPI.verifyCredentials();
    res.json({ 
      success: true,
      message: 'Connection test successful!',
      user: credentials.screen_name
    });
  } catch (error) {
    res.status(500).json({ error: 'Connection test failed: ' + error.message });
  }
});

// Legacy endpoints for backward compatibility
app.post('/api/post-now', async (req, res) => {
  try {
    if (!twitterAPI || !aiAPI) {
      return res.status(400).json({ error: 'APIs not configured' });
    }

    const content = await aiAPI.generateContent('Generate an engaging social media post');
    const tweet = await twitterAPI.postTweet(content);
    
    res.json({ success: true, tweet });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reply-now', async (req, res) => {
  try {
    if (!twitterAPI || !aiAPI) {
      return res.status(400).json({ error: 'APIs not configured' });
    }

    await processReplies();
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Automated functions
async function createScheduledPost() {
  try {
    if (!twitterAPI || !aiAPI || !settings.posting.enabled) return;

    const topics = settings.posting.topics.join(', ') || 'technology, innovation';
    const content = await aiAPI.generateContent(`Create an engaging post about: ${topics}`);
    await twitterAPI.postTweet(content);
    
    console.log('Scheduled post created:', content);
  } catch (error) {
    console.error('Error creating scheduled post:', error);
    activities.unshift({
      id: Date.now(),
      type: 'post',
      content: 'Failed to create post',
      timestamp: new Date().toISOString(),
      success: false,
      error: error.message
    });
  }
}

async function processReplies() {
  try {
    if (!twitterAPI || !aiAPI || !settings.replies.enabled) return;

    let repliesCount = 0;
    const maxReplies = settings.replies.maxRepliesPerHour;

    // Reply to own posts
    if (settings.replies.replyToOwnPosts) {
      const myTweets = await twitterAPI.getMyTweets(10);
      
      for (const tweet of myTweets) {
        if (repliesCount >= maxReplies) break;
        
        // Check if we already replied (simulate)
        const hasReplied = activities.some(a => 
          a.type === 'reply' && 
          a.originalTweetId === tweet.id &&
          Date.now() - new Date(a.timestamp).getTime() < 24 * 60 * 60 * 1000
        );
        
        if (!hasReplied && tweet.reply_count > 0) {
          const replyContent = await aiAPI.generateReply(tweet.text);
          await twitterAPI.replyToTweet(tweet.id, replyContent);
          repliesCount++;
        }
      }
    }

    // Reply to following
    if (settings.replies.replyToFollowing) {
      const followingTweets = await twitterAPI.getFollowingTweets(20);
      
      for (const tweet of followingTweets) {
        if (repliesCount >= maxReplies) break;
        
        // Don't reply to replies or retweets
        if (tweet.in_reply_to_status_id) continue;
        
        // Check if we already replied
        const hasReplied = activities.some(a => 
          a.type === 'reply' && 
          a.originalTweetId === tweet.id
        );
        
        if (!hasReplied && Math.random() < 0.3) { // 30% chance to reply
          const replyContent = await aiAPI.generateReply(tweet.text);
          await twitterAPI.replyToTweet(tweet.id, replyContent);
          repliesCount++;
        }
      }
    }

    console.log(`Processed ${repliesCount} replies`);
  } catch (error) {
    console.error('Error processing replies:', error);
  }
}

function updateCronJobs() {
  // Clear existing jobs
  Object.values(cronJobs).forEach(job => job.destroy());
  cronJobs = {};

  // Schedule posting
  if (settings.posting.enabled && settings.posting.interval) {
    cronJobs.posting = cron.schedule(settings.posting.interval, createScheduledPost, {
      scheduled: false
    });
    cronJobs.posting.start();
  }

  // Schedule reply processing (every 30 minutes)
  if (settings.replies.enabled) {
    cronJobs.replies = cron.schedule('*/30 * * * *', processReplies, {
      scheduled: false
    });
    cronJobs.replies.start();
  }
}

// Cleanup activities (keep only last 1000)
setInterval(() => {
  if (activities.length > 1000) {
    activities = activities.slice(0, 1000);
  }
}, 60 * 60 * 1000); // Every hour

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Twitter AI Agent server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
});

module.exports = app;