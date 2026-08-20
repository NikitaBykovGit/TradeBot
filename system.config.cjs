module.exports = {
  apps: [
    {
      name: 'trade-bot',
      script: 'dist/bot.js',
      instances: 1,
      autorestart: true,
      watch: false,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
