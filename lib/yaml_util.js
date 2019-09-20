const YAML = require('yaml');
const file_util = require('./file_util');

let read_yaml = function (path) {
    return file_util.read_file(path)
        .then(function (file_contents) {
            return YAML.parse(file_contents);
        });
};
let write_yaml = function (path, data) {
    return Promise.resolve(YAML.stringify(data))
        .then(function (yaml) {
            return file_util.write_file(path, yaml);
        })
};

module.exports = {
    read_yaml: read_yaml,
    write_yaml: write_yaml
};

