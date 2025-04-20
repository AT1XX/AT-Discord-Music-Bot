require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { Manager } = require('erela.js');
const Spotify = require("better-erela.js-spotify").default;
const axios = require('axios');

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent]
});

const spotifyAuth = {
  clientID: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  accessToken: '',
  refreshToken: '',
  tokenExpiry: null,
  tokenURL: 'https://accounts.spotify.com/api/token',

  // Refresh the token if expired
  async refreshToken() {
    const { clientID, clientSecret, refreshToken, tokenURL } = this;
    try {
      const response = await axios.post(tokenURL, new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: refreshToken
      }), {
        headers: {
          'Authorization': 'Basic ' + Buffer.from(clientID + ':' + clientSecret).toString('base64'),
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      });

      this.accessToken = response.data.access_token;
      this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);
      console.log('Spotify token refreshed successfully');
    } catch (error) {
      console.error('Error refreshing Spotify token:', error);
    }
  },

  // Check if the token is expired, if yes, refresh it
  async getAccessToken() {
    if (!this.accessToken || Date.now() > this.tokenExpiry) {
      await this.refreshToken();
    }
    return this.accessToken;
  }
};

client.manager = new Manager({
  nodes: [{
    host: "localhost",
    port: 2333,
    password: "youshallnotpass",
  }],
  plugins: [
    new Spotify({
      clientID: spotifyAuth.clientID,
      clientSecret: spotifyAuth.clientSecret,
      getAccessToken: () => spotifyAuth.getAccessToken(), // Provide the custom token handler
    })
  ],
  send: (id, payload) => {
    const guild = client.guilds.cache.get(id);
    if (guild) guild.shard.send(payload);
  }
});

client.on("ready", () => {
  console.log(`Logged in as ${client.user.tag}`);
  client.manager.init(client.user.id);
});

client.on("raw", d => client.manager.updateVoiceState(d));

client.on("messageCreate", async message => {
  if (message.author.bot || !message.content.startsWith("!")) return;
  const [cmd, ...args] = message.content.slice(1).trim().split(/ +/g);

  if (cmd === "play") {
    const search = args.join(" ");
    const res = await client.manager.search(search, message.author);
    const player = client.manager.create({
      guild: message.guild.id,
      voiceChannel: message.member.voice.channel.id,
      textChannel: message.channel.id,
    });
    player.connect();
    player.queue.add(res.tracks[0]);
    if (!player.playing && !player.paused && !player.queue.size) player.play();
    message.reply(`Queued: ${res.tracks[0].title}`);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("pause").setLabel("Pause").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("skip").setLabel("Skip").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId("stop").setLabel("Stop").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId("lyrics").setLabel("Lyrics").setStyle(ButtonStyle.Success),
    );
    message.channel.send({ content: "Controls:", components: [row] });
  }
});

client.login(process.env.DISCORD_TOKEN);
