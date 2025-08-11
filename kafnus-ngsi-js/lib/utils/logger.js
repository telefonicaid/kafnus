// Logger simple; TBD
function info(...args) { console.log('[INFO]', ...args); }
function warn(...args) { console.warn('[WARN]', ...args); }
function error(...args) { console.error('[ERROR]', ...args); }

module.exports = { info, warn, error };
