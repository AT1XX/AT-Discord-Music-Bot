require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Manager } = require('erela.js');
const { getLyrics } = require('lyrics-finder');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const manager = new Manager({
  nodes: [{
    host: process.env.LAVALINK_HOST || 'localhost',
    port: parseInt(process.env.LAVALINK_PORT) || 2333,
    password: process.env.LAVALINK_PASSWORD,
    identifier: 'Main-Node',
    retryAmount: 5,
    retryDelay: 3000
  }],
  send: (id, payload) => {
    const guild = client.guilds.cache.get(id);
    if (guild) guild.shard.send(payload);
  },
  autoPlay: true
});

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
  manager.init(client.user.id);
  
  // Register slash commands
  client.application.commands.set([{
    name: 'play',
    description: 'Play music',
    options: [{
      name: 'query',
      type: 3,
      description: 'Song/URL to play',
      required: true
    }]
  }]);
  console.log('Commands registered!');
});

// Player events
manager
  .on('nodeConnect', node => console.log(`Node ${node.identifier} connected`))
  .on('nodeError', (node, error) => console.error(`Node ${node.identifier} error:`, error))
  .on('trackStart', async (player, track) => {
    const controller = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('pause')
        .setLabel('⏯️ Pause/Resume')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('skip')
        .setLabel('⏭️ Skip')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('lyrics')
        .setLabel('📜 Lyrics')
        .setStyle(ButtonStyle.Success)
    );

    const embed = new EmbedBuilder()
      .setTitle('🎶 Now Playing')
      .setDescription(`**${track.title}**`)
      .setThumbnail(track.thumbnail)
      .addFields(
        { name: 'Duration', value: track.duration, inline: true },
        { name: 'Requested By', value: track.requester?.username || 'Autoplay', inline: true }
      );

    const channel = client.channels.cache.get(player.textChannel);
    if (channel) channel.send({ embeds: [embed], components: [controller] });
  });

// Command Handling
client.on('interactionCreate', async interaction => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === 'play') {
      await handlePlayCommand(interaction);
    }
  } catch (error) {
    console.error('Command error:', error);
    await interaction.reply({ content: '❌ Command failed!', ephemeral: true });
  }
});

// Button Handling
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  await interaction.deferUpdate();

  const player = manager.players.get(interaction.guildId);
  if (!player) return;

  switch (interaction.customId) {
    case 'pause':
      player.paused ? player.resume() : player.pause();
      break;
    case 'skip':
      player.stop();
      break;
    case 'lyrics':
      const lyrics = await getLyrics(player.queue.current.title);
      const lyricsEmbed = new EmbedBuilder()
        .setTitle(`${player.queue.current.title} Lyrics`)
        .setDescription(lyrics?.substring(0, 4096) || 'No lyrics found');
      interaction.followUp({ embeds: [lyricsEmbed], ephemeral: true });
      break;
  }
});

async function handlePlayCommand(interaction) {
  await interaction.deferReply();
  const query = interaction.options.getString('query');
  const channel = interaction.member.voice.channel;

  if (!channel) {
    return interaction.editReply('❌ Join a voice channel first!');
  }

  const player = manager.create({
    guild: interaction.guildId,
    voiceChannel: channel.id,
    textChannel: interaction.channelId,
    selfDeafen: true,
    volume: 50
  });

  try {
    if (player.state !== 'CONNECTED') await player.connect();
    
    const search = await manager.search(query, interaction.user);
    if (!search.tracks.length) {
      return interaction.editReply('❌ No results found!');
    }

    player.queue.add(search.tracks[0]);
    if (!player.playing && !player.paused) player.play();

    await interaction.deleteReply();
  } catch (error) {
    console.error('Play error:', error);
    interaction.editReply('❌ Failed to play track!');
  }
}

client.login(process.env.DISCORD_TOKEN);