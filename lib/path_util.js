const fs = require('fs');
const node_path = require('path');
const Promise = require('bluebird');
const glob = Promise.promisify(require('glob'));
const _ = require('lodash');

let resolve = function (path) {
    let args = _.concat([process.cwd()], _.slice(arguments));
    return node_path.resolve.apply(null, args);
};

let basename = function (path, ext) {
    path = resolve(path);
    return node_path.basename(path, ext);
};

let dirname = function (path) {
    path = resolve(path);
    return node_path.dirname(path);
};


let extname = function (path) {
    path = resolve(path);
    return node_path.extname(path);
};

module.exports = {
    resolve:resolve,
    basename:basename,
    dirname:dirname,
    extname:extname
};