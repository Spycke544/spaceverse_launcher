const axios = require('axios');

const DEFAULT_OPTIONS = {
    timeout: 10000,
    cacheTime: 5000 // Cache results for 5 seconds
};

const UA = 'SpaceVerse-Launcher/1.0.0';

// Simple in-memory cache
const cache = new Map();

class Server {
    constructor(ip, options = {}) {
        if (!ip) throw new Error('Please provide a server IP in config.json');

        this.ip = ip.replace(/"/g, '');
        this.options = { ...DEFAULT_OPTIONS, ...options };
        this.baseUrl = `http://${this.ip}`;
    }

    async fetchWithCache(cacheKey, endpoint) {
        const cached = cache.get(cacheKey);
        if (cached && Date.now() - cached.timestamp < this.options.cacheTime) {
            return cached.data;
        }

        try {
            const response = await axios.get(`${this.baseUrl}/${endpoint}`, {
                headers: { 'User-Agent': UA },
                timeout: this.options.timeout
            });

            cache.set(cacheKey, {
                data: response.data,
                timestamp: Date.now()
            });

            return response.data;
        } catch (error) {
            cache.delete(cacheKey);
            throw error;
        }
    }

    /**
     * Number of connected players
     * @returns {Promise<number>}
     */
    async getPlayersCounter() {
        try {
            const players = await this.fetchWithCache(`players_${this.ip}`, 'players.json');
            return Array.isArray(players) ? players.length : 0;
        } catch (error) {
            console.error('Error fetching player count:', error.message);
            return 0;
        }
    }

    /**
     * Full list of connected players
     * @returns {Promise<Array>}
     */
    async getPlayersList() {
        try {
            const players = await this.fetchWithCache(`playerlist_${this.ip}`, 'players.json');
            return players || [];
        } catch (error) {
            console.error('Error fetching player list:', error.message);
            return [];
        }
    }

    /**
     * Full server status + measured latency (ms).
     * @returns {Promise<{online:boolean, players?:number, maxPlayers?:number, serverName?:string, ping?:number, error?:string}>}
     */
    async getServerStatus() {
        const started = Date.now();
        try {
            const [infoData, playersData] = await Promise.all([
                axios.get(`${this.baseUrl}/info.json`, {
                    headers: { 'User-Agent': UA },
                    timeout: this.options.timeout
                }).catch(() => null),
                axios.get(`${this.baseUrl}/players.json`, {
                    headers: { 'User-Agent': UA },
                    timeout: this.options.timeout
                }).catch(() => null)
            ]);

            const ping = Date.now() - started;

            if (!playersData) {
                return { online: false, error: 'Server not responding', ping };
            }

            const players = playersData.data || [];
            const info = infoData?.data || {};
            const maxPlayers = parseInt(info.vars?.sv_maxClients) || 0;
            const serverName =
                info.vars?.sv_projectName ||
                info.vars?.sv_hostname ||
                'Space Verse';

            return {
                online: true,
                players: players.length,
                maxPlayers,
                serverName,
                ping
            };
        } catch (error) {
            return { online: false, error: error.message, ping: Date.now() - started };
        }
    }

    async getMaxPlayers() {
        try {
            const info = await this.fetchWithCache(`info_${this.ip}`, 'info.json');
            return parseInt(info.vars?.sv_maxClients) || 0;
        } catch (error) {
            console.error('Error fetching max players:', error.message);
            return 0;
        }
    }

    async getServerInfo() {
        try {
            const info = await this.fetchWithCache(`info_${this.ip}`, 'info.json');
            return {
                hostname: info.vars?.sv_hostname || 'Space Verse',
                gametype: info.vars?.gametype || '',
                mapname: info.vars?.mapname || '',
                resources: info.resources || [],
                vars: info.vars || {}
            };
        } catch (error) {
            console.error('Error fetching server info:', error.message);
            return null;
        }
    }

    clearCache() {
        for (const key of cache.keys()) {
            if (key.includes(this.ip)) cache.delete(key);
        }
    }
}

module.exports = Server;
