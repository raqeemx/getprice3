'use strict';

// Logger بسيط مع طوابع زمنية ومستويات — يُستخدم في الـ workers والخدمات.
function ts() {
  return new Date().toISOString();
}
function fmt(level, scope, args) {
  const prefix = `[${ts()}] [${level}]` + (scope ? ` [${scope}]` : '');
  return [prefix, ...args];
}

function make(scope) {
  return {
    info: (...a) => console.log(...fmt('INFO', scope, a)),
    warn: (...a) => console.warn(...fmt('WARN', scope, a)),
    error: (...a) => console.error(...fmt('ERROR', scope, a)),
    debug: (...a) => {
      if (process.env.DEBUG) console.log(...fmt('DEBUG', scope, a));
    },
    child: (child) => make(scope ? `${scope}:${child}` : child),
  };
}

module.exports = make('');
module.exports.scope = (s) => make(s);
