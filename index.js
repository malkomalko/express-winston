// Copyright (c) 2012-2014 Heapsource.com and Contributors
// http://www.heapsource.com
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NON-INFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//
var util    = require('util');
var winston = require('winston');

delete require.cache[require.resolve('underscore')];
var _ = require('underscore');
delete require.cache[require.resolve('underscore')];

var requestWhitelist = [
  'headers',
  'httpVersion',
  'method',
  'originalUrl',
  'query',
  'url'
];

var bodyBlacklist     = [];
var bodyWhitelist     = [];
var headersBlacklist  = [];
var responseWhitelist = ['statusCode'];

var defaultRequestFilter = function (req, propName) {
  return req[propName];
};

var defaultResponseFilter = function (res, propName) {
  return res[propName];
};

function filterObject (originalObj, whiteList, initialFilter) {
  var obj = {};

  [].concat(whiteList).forEach(function (propName) {
    var value = initialFilter(originalObj, propName);

    if (typeof (value) !== 'undefined') {
      obj[propName] = value;
    };
  });

  return obj;
};

function errorLogger (options) {
  ensureValidOptions(options);

  options.requestFilter = options.requestFilter || defaultRequestFilter;

  return function (err, req, res, next) {
    var exceptionMeta = winston.exception.getAllInfo(err);
    exceptionMeta.req = filterObject(
      req, requestWhitelist, options.requestFilter);

    for (var i = 0; i < options.transports.length; i++) {
      var transport = options.transports[i];
      transport.logException('middlewareError', exceptionMeta, function () {
        // Nothing to do here
      });
    }

    next(err);
  };
};

function logger (options) {
  ensureValidOptions(options);

  options.requestFilter  = options.requestFilter || defaultRequestFilter;
  options.responseFilter = options.responseFilter || defaultResponseFilter;
  options.level          = options.level || "info";
  options.statusLevels   = options.statusLevels || false;
  options.msg            = options.msg || "HTTP {{req.method}} {{req.url}}";

  return function (req, res, next) {
    req._startTime = (new Date);

    req._routeWhitelists = {
      req: [],
      res: [],
      body: []
    };

    req._routeBlacklists = {
      body: []
    };

    var end = res.end;
    res.end = function (chunk, encoding) {
      res.responseTime = (new Date) - req._startTime;

      res.end = end;
      res.end(chunk, encoding);

      if (options.statusLevels) {
        if (res.statusCode >= 100) { options.level = "info"; }
        if (res.statusCode >= 400) { options.level = "warn"; }
        if (res.statusCode >= 500) { options.level = "error"; }
      };

      var meta = {};

      if (options.meta !== false) {
        var bodyWhitelist, blacklist;

        requestWhitelist = requestWhitelist.concat(
          req._routeWhitelists.req || []);
        responseWhitelist = responseWhitelist.concat(
          req._routeWhitelists.res || []);

        meta.req = filterObject(req, requestWhitelist, options.requestFilter);
        meta.res = filterObject(res, responseWhitelist, options.responseFilter);

        if (_.contains(responseWhitelist, 'body')) {
          if (res._headers['content-type']) {
            if (res._headers['content-type'].indexOf('json') >= 0) {
              try {
                meta.res.body = JSON.parse(chunk);
              } catch (e) {}
            }
          }
        }

        if (headersBlacklist.length > 0) {
          var keys = _.difference(_.keys(req.headers), headersBlacklist);
          meta.req.headers = filterObject(
            req.headers, keys, options.requestFilter);
        }

        bodyWhitelist = req._routeWhitelists.body || [];
        blacklist = _.union(bodyBlacklist, (req._routeBlacklists.body || []));

        if (blacklist.length > 0 && bodyWhitelist.length === 0) {
          var whitelist = _.difference(_.keys(req.body), blacklist);
          meta.req.body = filterObject(
            req.body, whitelist, options.requestFilter);
        } else {
          meta.req.body = filterObject(
            req.body, bodyWhitelist, options.requestFilter);
        }

        meta.responseTime = res.responseTime;
      }

      _.templateSettings = {
        interpolate: /\{\{(.+?)\}\}/g
      };

      var template = _.template(options.msg);
      var msg = template({req: req, res: res});

      for (var i = 0; i < options.transports.length; i++) {
        var transport = options.transports[i];
        transport.log(options.level, msg, meta, function () {
          // Nothing to do here
        });
      }
    };

    next();
  };
};

function ensureValidOptions (options) {
  if (!options) {
    throw new Error("options are required by express-winston middleware");
  }

  if (!options.transports || !(options.transports.length > 0)) {
    throw new Error("transports are required by express-winston middleware");
  }
};

module.exports.bodyBlacklist         = bodyBlacklist;
module.exports.bodyWhitelist         = bodyWhitelist;
module.exports.defaultRequestFilter  = defaultRequestFilter;
module.exports.defaultResponseFilter = defaultResponseFilter;
module.exports.errorLogger           = errorLogger;
module.exports.headersBlacklist      = headersBlacklist;
module.exports.logger                = logger;
module.exports.requestWhitelist      = requestWhitelist;
module.exports.responseWhitelist     = responseWhitelist;
