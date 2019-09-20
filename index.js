const Promise = require('bluebird');
Promise.longStackTraces();
const _ = require('lodash');
const commander = require('commander');
const path_util = require('./lib/path_util');
const file_util = require('./lib/file_util');
const render = require('./lib/render');
const config_schema = require('./lib/config_schema');

commander.version('0.1.0');

commander
    .arguments('[config_file]')
    .action(function (config_file_path) {

        if (_.isNil(config_file_path)) {
            config_file_path = path_util.resolve('config.yml');
        }

        return config_schema.load(config_file_path)
            .then(function (data) {
                let rendered_files = render.render(data);

                let output_directory_path = path_util.resolve('output', path_util.basename(config_file_path, path_util.extname(config_file_path)));
                return file_util.rm_glob(path_util.resolve(output_directory_path, '*.*'))
                    .then(function () {
                        return file_util.mkdir(output_directory_path, true)
                    })
                    .then(function () {
                        return file_util.ls_glob(path_util.resolve('templates', '*.tf'))
                            .then(function (files) {
                                return Promise.map(files, function (file) {
                                    let destination = path_util.resolve(output_directory_path, path_util.basename(file.path));
                                    return file_util.copy(file.path, destination);
                                });
                            })
                    })
                    .then(function () {
                        return Promise.map(rendered_files, function (file) {
                            let file_name = _.get(file, 'file_name');
                            let file_contents = _.get(file, 'file_contents');

                            let output_path = path_util.resolve(output_directory_path, file_name);
                            return file_util.write_file(output_path, file_contents);
                        });
                    });
            })
            .catch(function (err) {
                console.error(err.stack);
                process.exit(1);
            });
    });

commander.parse(process.argv);

