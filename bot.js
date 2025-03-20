require('dotenv').config();
const { Client, GatewayIntentBits } = require('discord.js');
const { DisTube } = require('distube');
const { YtDlpPlugin } = require('@distube/yt-dlp');
const { SpotifyPlugin } = require('@distube/spotify');
const { exec } = require('child_process');
const axios = require('axios');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

// 🔥 Caché para mejorar la velocidad de búsqueda
const searchCache = new Map();

// ✅ Configurar DisTube con YT-DLP y Spotify
const distube = new DisTube(client, {
  emitNewSongOnly: true,
  plugins: [
    new YtDlpPlugin({ update: false }), // Soporte para YouTube
    new SpotifyPlugin() // 🟢 Soporte para Spotify
  ]
});

// ✅ Evento cuando el bot está listo
client.once('ready', () => {
  console.log(`✅ Bot conectado como ${client.user.tag}`);
});

// ✅ Manejo de mensajes (comandos)
client.on('messageCreate', async (message) => {
  if (!message.guild || message.author.bot) return;
  const args = message.content.split(' ');

  // 🎶 Comando `!join` → Unir el bot al canal de voz
  if (args[0] === '!join') {
    if (!message.member.voice.channel) {
      return message.reply('❌ Debes estar en un canal de voz.');
    }

    try {
      await distube.voices.join(message.member.voice.channel);
      message.reply('✅ Me uní al canal de voz.');
    } catch (error) {
      console.error(error);
      message.reply('❌ No pude unirme al canal de voz.');
    }
  }

  // 🎵 Comando `!play <canción o URL>` → Reproducir música (YouTube o Spotify)
  if (args[0] === '!play') {
    if (!message.member.voice.channel) {
      return message.reply('❌ Debes estar en un canal de voz.');
    }
    if (!args[1]) {
      return message.reply('❌ Debes proporcionar una canción o URL.');
    }

    let query = args.slice(1).join(' ');

    try {
      // 🔥 Si es un enlace de Spotify, convertirlo a un título para buscar en YouTube
      if (query.includes('spotify.com')) {
        query = await obtenerTituloDesdeSpotify(query);
        if (!query) {
          return message.reply('❌ No pude obtener la canción desde Spotify.');
        }
      }

      // 🔥 Reproducir desde caché si existe
      if (searchCache.has(query)) {
        const cachedSong = searchCache.get(query);
        await distube.play(message.member.voice.channel, cachedSong.url, {
          member: message.member,
          textChannel: message.channel
        });
        return message.reply(`🎶 Reproduciendo (caché): **${cachedSong.title}**`);
      }

      // 🎵 Intentar reproducir con DisTube (YouTube)
      await distube.play(message.member.voice.channel, query, {
        member: message.member,
        textChannel: message.channel
      });
    } catch (error) {
      console.error("❌ DisTube no encontró la canción. Intentando con yt-dlp...");

      // 🔍 Buscar manualmente con yt-dlp
      buscarConYtdlp(query).then(async (result) => {
        if (!result || !result.url) {
          return message.reply('❌ No pude encontrar la canción.');
        }
        try {
          // Guardar en caché
          searchCache.set(query, result);

          await distube.play(message.member.voice.channel, result.url, {
            member: message.member,
            textChannel: message.channel
          });
        } catch (playError) {
          console.error(playError);
          message.reply('❌ Error al intentar reproducir la canción.');
        }
      });
    }
  }

  // ⏭ Comando `!skip` → Saltar canción actual
  if (args[0] === '!skip') {
    const queue = distube.getQueue(message.guild.id);
    if (!queue || queue.songs.length <= 1) {
      return message.reply('❌ No hay más canciones en la cola.');
    }
    queue.skip();
    message.reply('⏭ Saltado.');
  }

  // 🛑 Comando `!stop` → Detener la música y vaciar la cola
  if (args[0] === '!stop') {
    const queue = distube.getQueue(message.guild.id);
    if (!queue) {
      return message.reply('❌ No hay música reproduciéndose.');
    }
    queue.stop();
    message.reply('🛑 Música detenida y cola vaciada.');
  }

  // 🎶 Comando `!queue` → Ver la cola de canciones
  if (args[0] === '!queue') {
    const queue = distube.getQueue(message.guild.id);
    if (!queue) {
      return message.reply('❌ No hay canciones en la cola.');
    }

    message.reply(
      `🎶 **Cola:**\n` +
      queue.songs
        .map((song, id) => `**${id + 1}**. ${song.name} \`[${song.formattedDuration}]\``)
        .join('\n')
    );
  }

  // 🚪 Comando `!leave` → Desconectar el bot del canal de voz
  if (args[0] === '!leave') {
    const connection = distube.voices.get(message.guild);
    if (!connection) {
      return message.reply('❌ No estoy en un canal de voz.');
    }
    connection.leave();
    message.reply('👋 Adiós.');
  }
});

// ✅ Función para buscar con `yt-dlp`
async function buscarConYtdlp(query) {
  return new Promise((resolve) => {
    exec(`yt-dlp "ytsearch1:${query}" --print "%(title)s|%(webpage_url)s"`,
      (err, stdout, stderr) => {
        if (err || !stdout.trim()) {
          console.error("❌ Error en yt-dlp:", err || stderr);
          return resolve(null);
        }
        const [title, url] = stdout.trim().split("|");
        resolve({ title, url });
      }
    );
  });
}

// ✅ Función para obtener el nombre de la canción desde Spotify
async function obtenerTituloDesdeSpotify(url) {
  try {
    const trackId = url.split("track/")[1].split("?")[0];
    const spotifyApiUrl = `https://open.spotify.com/oembed?url=https://open.spotify.com/track/${trackId}`;
    const response = await axios.get(spotifyApiUrl);
    return response.data.title; 
  } catch (error) {
    console.error("❌ Error obteniendo título desde Spotify:", error);
    return null;
  }
}

// ✅ Eventos de DisTube
distube.on('playSong', (queue, song) => {
  queue.textChannel.send(`▶️ **Reproduciendo:** ${song.name} \`[${song.formattedDuration}]\``);
});

distube.on('addSong', (queue, song) => {
  queue.textChannel.send(`➕ **${song.name}** añadida a la cola.`);
});

// ✅ Iniciar el bot
console.log("Todas las variables de entorno:", process.env);
console.log("TOKEN CARGADO:", process.env.TOKEN ? "✅ Sí" : "❌ No encontrado");
client.login(process.env.TOKEN);
