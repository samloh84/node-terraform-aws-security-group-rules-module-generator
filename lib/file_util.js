const fs = require('fs');
const path_util = require('./path_util');
const Promise = require('bluebird');
const glob = Promise.promisify(require('glob'));
const _ = require('lodash');


let read_file = function (path) {
    return new Promise(function (resolve, reject) {
        path = path_util.resolve(path);
        return fs.readFile(path, 'utf8', function (err, data) {
            if (!_.isNil(err)) {
                return reject(err);
            } else {
                return resolve(data);
            }
        })
    })
};

let write_file = function (path, data) {
    return new Promise(function (resolve, reject) {
        path = path_util.resolve(path);
        return fs.writeFile(path, data, 'utf8', function (err) {
            if (!_.isNil(err)) {
                return reject(err);
            } else {
                return resolve();
            }
        })
    });
};

let stat = function (path) {
    return new Promise(function (resolve, reject) {
        path = path_util.resolve(path);
        return fs.stat(path, function (err, stats) {
            if (!_.isNil(err)) {
                return reject(err);
            } else {
                return resolve(stats);
            }
        })
    });
};

let mkdir = function (path, recursive) {
    return new Promise(function (resolve, reject) {
        path = path_util.resolve(path);
        return fs.mkdir(path, {recursive: recursive}, function (err) {
            if (!_.isNil(err)) {
                return reject(err);
            } else {
                return resolve();
            }
        })
    });
};


let readdir = function (path) {
    return new Promise(function (resolve, reject) {
        path = path_util.resolve(path);
        return fs.readdir(path, function (err, files) {
            if (!_.isNil(err)) {
                return reject(err);
            } else {
                return resolve(files);
            }
        })
    });
};


let rmdir = function (path) {
    return new Promise(function (resolve, reject) {
        path = path_util.resolve(path);
        return fs.rmdir(path, function (err) {
            if (!_.isNil(err)) {
                return reject(err);
            } else {
                return resolve();
            }
        })
    });
};


let unlink = function (path) {
    return new Promise(function (resolve, reject) {
        path = path_util.resolve(path);
        return fs.unlink(path, function (err) {
            if (!_.isNil(err)) {
                return reject(err);
            } else {
                return resolve();
            }
        })
    });
};


let walk = function (path, fn, recursive) {
    path = path_util.resolve(path);
    return stat(path)
        .then(function (stats) {
            return Promise.resolve(fn({path: path, stats: stats}))
                .then(function () {
                    if (stats.isDirectory()) {
                        return readdir(path)
                            .then(function (dir_file_paths) {
                                dir_file_paths = _.map(dir_file_paths, function (dir_file_path) {
                                    return path_util.resolve(path, dir_file_path);
                                });
                                if (recursive) {
                                    return Promise.map(dir_file_paths, function (dir_file_path) {
                                        return walk(dir_file_path, fn);
                                    });
                                }
                            });
                    }
                });
        })
};


let ls = function (path, recursive) {
    if (_.isArray(arguments[0])) {
        return Promise.map(arguments[0], function (arg) {
            return ls(arg, recursive);
        })
            .then(function (results) {
                return _.flatten(results);
            });
    }

    path = path_util.resolve(process.cwd(), path);
    let files = [];
    return walk(path, function (file) {
        files.push(file);
    }, recursive)
        .then(function () {
            return files;
        })
};

let rm = function (path, recursive) {
    if (_.isArray(arguments[0])) {
        return Promise.map(arguments[0], function (arg) {
            return rm(arg, recursive);
        })
    }

    path = path_util.resolve(path);
    return ls(path, recursive)
        .then(function (files) {
            return Promise.map(files, function (file) {
                if (file.stats.isDirectory()) {
                    return Promise.resolve(fs.promises.rmdir(path));
                } else {
                    return Promise.resolve(fs.promises.unlink(path));
                }
            })
        });
};

let ls_glob = function (pattern) {
    pattern = path_util.resolve(pattern);
    return glob(pattern)
        .then(function (files) {
            files = _.map(files, function (file) {
                return path_util.resolve(file);
            });

            return Promise.map(files, function (file) {
                return Promise.props({
                    path: file,
                    stats: stat(file)
                })
            });
        })
};

let rm_glob = function (pattern) {
    pattern = path_util.resolve(pattern);
    return ls_glob(pattern)
        .then(function (files) {
            return Promise.map(files, function (file) {
                if (file.stats.isDirectory()) {
                    return rmdir(file.path)
                } else {
                    return unlink(file.path);
                }
            })
        })
};

let copy = function (source, destination) {
    return new Promise(function (resolve, reject) {
        source = path_util.resolve(source);
        destination = path_util.resolve(destination);
        return fs.copyFile(source, destination, function (err) {
            if (!_.isNil(err)) {
                return reject(err);
            } else {
                return resolve();
            }
        })
    });
};


module.exports = {
    read_file: read_file,
    write_file: write_file,
    stat: stat,
    readdir: readdir,
    rmdir: rmdir,
    unlink: unlink,
    walk: walk,
    ls: ls,
    rm: rm,
    ls_glob: ls_glob,
    rm_glob: rm_glob,
    mkdir: mkdir,
    copy: copy
};

