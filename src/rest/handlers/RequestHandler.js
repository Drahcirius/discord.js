const DiscordAPIError = require('../DiscordAPIError');
const { Events: { RATE_LIMIT } } = require('../../util/Constants');

class RequestHandler {
  constructor(manager, handler) {
    this.manager = manager;
    this.client = this.manager.client;
    this.handle = handler.bind(this);
    this.limit = Infinity;
    this.resetTime = null;
    this.remaining = 1;

    this.queue = [];
  }

  get limited() {
    return this.manager.globallyRateLimited || this.remaining <= 0;
  }

  set globallyLimited(limited) {
    this.manager.globallyRateLimited = limited;
  }

  push(request) {
    this.queue.push(request);
    this.handle();
  }

  execute(item) {
    return new Promise((resolve, reject) => {
      const finish = timeout => {
        if (timeout || this.limited) {
          if (!timeout) {
            timeout = this.resetTime - Date.now() + this.manager.timeDifference + this.client.options.restTimeOffset;
          }
          // eslint-disable-next-line prefer-promise-reject-errors
          reject({ timeout });
          if (this.client.listenerCount(RATE_LIMIT)) {
            /**
             * Emitted when the client hits a rate limit while making a request
             * @event Client#rateLimit
             * @param {Object} rateLimitInfo Object containing the rate limit info
             * @param {number} rateLimitInfo.timeout Timeout in ms
             * @param {number} rateLimitInfo.limit Number of requests that can be made to this endpoint
             * @param {number} rateLimitInfo.timeDifference Delta-T in ms between your system and Discord servers
             * @param {string} rateLimitInfo.method HTTP method used for request that triggered this event
             * @param {string} rateLimitInfo.path Path used for request that triggered this event
             * @param {string} rateLimitInfo.route Route used for request that triggered this event
             */
            this.client.emit(RATE_LIMIT, {
              timeout,
              limit: this.limit,
              timeDifference: this.manager.timeDifference,
              method: item.request.method,
              path: item.request.path,
              route: item.request.route,
            });
          }
        } else {
          resolve();
        }
      };
      item.request.gen().then(async res => {
        if (!res.ok) {
          if (res.status === 429) {
            this.queue.unshift(item);
            finish(Number(res.headers.get('retry-after')) + this.client.options.restTimeOffset);
          } else if (res.status >= 500 && res.status < 600) {
            this.queue.unshift(item);
            finish(1e3 + this.client.options.restTimeOffset);
          } else if (res.status >= 400 && res.status < 500) {
            item.reject(new DiscordAPIError(res.url, await res.json()));
            finish();
          } else {
            item.reject(`${res.status}: ${res.statusCode}`);
            finish();
          }
        } else {
          if (res.headers.get('x-ratelimit-global')) this.globallyLimited = true;
          this.limit = Number(res.headers.get('x-ratelimit-limit'));
          this.resetTime = Number(res.headers.get('x-ratelimit-reset')) * 1000;
          this.remaining = Number(res.headers.get('x-ratelimit-remaining'));
          this.manager.timeDifference = Date.now() - new Date(res.headers.get('date')).getTime();

          const data = await res.json() || {};
          item.resolve(data);
          finish();
        }
      }).catch(err => {
        item.reject(err);
        finish();
      });
    });
  }

  reset() {
    this.globallyLimited = false;
    this.remaining = 1;
  }
}

module.exports = RequestHandler;
