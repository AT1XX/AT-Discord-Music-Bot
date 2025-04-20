require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { Player } = require('discord-player');
const { getLyrics } = require('lyrics-finder');
const { DefaultExtractors, YouTubeExtractor } = require('@discord-player/extractor');


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates
  ]
});

const player = new Player(client, {
  ytdlOptions: {
    quality: 'highestaudio',
    highWaterMark: 1 << 25,
    filter: 'audioonly'
  }
});

client.on('ready', async () => {
  console.log(`Logged in as ${client.user.tag}!`);

  try {
    // Load all default extractors correctly
    //await player.extractors.loadMulti([new YouTubeExtractor()]);
    //await player.extractors.loadMulti(DefaultExtractors);
    console.log('Extractors loaded successfully');

    await client.application.commands.set([{
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
  } catch (error) {
    console.error('Initialization error:', error);
    process.exit(1);
  }
});


player.events.on('playerStart', (queue, track) => {
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
      { name: 'Requested By', value: track.requestedBy.username, inline: true }
    );

  queue.metadata.channel.send({ embeds: [embed], components: [controller] });
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    // Command handling
    try {
      if (interaction.commandName === 'play') {
        await handlePlayCommand(interaction);
      }
    } catch (error) {
      console.error('Command error:', error);
      await interaction.reply({ content: '❌ Command failed!', ephemeral: true });
    }
  } else if (interaction.isButton()) {
    // Button handling
    try {
      await handleButtonInteraction(interaction);
    } catch (error) {
      console.error('Button error:', error);
    }
  }
});

async function handlePlayCommand(interaction) {
  const member = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  const channel = member?.voice?.channel;

  if (!channel) {
    return interaction.reply({
      content: '❌ You must be in a voice channel to use this command!',
      ephemeral: true
    });
  }

  await interaction.deferReply();
  const query = interaction.options.getString('query');
  console.log(`[SlashCommand] /play triggered with query: ${query}`);

  const queue = player.nodes.create(interaction.guild, {
    metadata: {
      channel: interaction.channel,
      client: interaction.guild.members.me,
      requestedBy: interaction.user
    },
    selfDeaf: true,
    volume: 50,
    leaveOnEmpty: true
  });

  try {
    if (!queue.connection) await queue.connect(channel);
  } catch (error) {
    queue.delete();
    return interaction.editReply('❌ Could not join voice channel!');
  }

  console.log('Searching for track...');
  const searchResult = await player.search(query, {
    requestedBy: interaction.user
  });

  console.log('Search result:', {
    query: searchResult.query,
    type: searchResult.queryType,
    trackCount: searchResult.tracks.length,
    tracks: searchResult.tracks.map(t => ({
      title: t.title,
      url: t.url,
      duration: t.duration
    }))
  });
  

  if (!searchResult.hasTracks()) {
    console.warn('❌ play-dl might still be broken or blocked');
    return interaction.editReply('❌ No YouTube results found. Make sure the video is public and play-dl is working.');
  }

  searchResult.playlist ? 
    queue.addTrack(searchResult.tracks) : 
    queue.addTrack(searchResult.tracks[0]);

  if (!queue.isPlaying()) await queue.node.play();
  await interaction.deleteReply();
}

async function handleButtonInteraction(interaction) {
  await interaction.deferUpdate();
  const queue = player.nodes.get(interaction.guild);
  if (!queue) return;

  switch (interaction.customId) {
    case 'pause':
      queue.node.isPaused() ? queue.node.resume() : queue.node.pause();
      break;
    case 'skip':
      queue.node.skip();
      break;
    case 'lyrics':
      const lyrics = await getLyrics(queue.currentTrack.title);
      const lyricsEmbed = new EmbedBuilder()
        .setTitle(`${queue.currentTrack.title} Lyrics`)
        .setDescription(lyrics?.substring(0, 4096) || 'No lyrics found');
      interaction.followUp({ embeds: [lyricsEmbed], ephemeral: true });
      break;
  }
}

client.login(process.env.DISCORD_TOKEN);