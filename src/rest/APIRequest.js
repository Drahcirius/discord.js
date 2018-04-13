const querystring = require('querystring');
const fetch = require('node-fetch');
const FormData = require('form-data');
const https = require('https');
const { browser, UserAgent } = require('../util/Constants');

if (https.Agent) var agent = new https.Agent({ keepAlive: true });

class APIRequest {
  constructor(rest, method, path, options) {
    this.rest = rest;
    this.client = rest.client;
    this.method = method;
    this.route = options.route;
    this.options = options;

    const queryString = (querystring.stringify(options.query).match(/[^=&?]+=[^=&?]+/g) || []).join('&');
    this.path = `${path}${queryString ? `?${queryString}` : ''}`;
  }

  gen() {
    const API = this.options.versioned === false ? this.client.options.http.api :
      `${this.client.options.http.api}/v${this.client.options.http.version}`;

    const requestOptions = { method: this.method, headers: {}, agent };

    if (this.options.auth !== false) requestOptions.headers.Authorization = this.rest.getAuth();
    if (this.options.reason) requestOptions.headers['X-Audit-Log-Reason'] = encodeURIComponent(this.options.reason);
    if (!browser) requestOptions.headers['User-Agent'] = UserAgent;
    if (this.options.headers) {
      Object.keys(this.options.headers).forEach(header => {
        requestOptions.headers[header] = this.options.headers[header];
      });
    }

    if (this.options.files) {
      const form = new FormData();
      for (const file of this.options.files) {
        if (file && file.file) form.append(file.name, file.file, { filename: file.name });
      }
      if (typeof this.options.data !== 'undefined') form.append('payload_json', JSON.stringify(this.options.data));
      requestOptions.headers['Content-Type'] = form.getHeaders()['content-type'];
      requestOptions.body = form;
    } else if (typeof this.options.data !== 'undefined') {
      requestOptions.headers['Content-Type'] = 'application/json';
      requestOptions.body = JSON.stringify(this.options.data);
    }

    return fetch(`${API}${this.path}`, requestOptions);
  }
}

module.exports = APIRequest;
