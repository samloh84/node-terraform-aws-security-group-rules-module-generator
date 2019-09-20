const node_path = require('path');
const nunjucks = require('nunjucks');

let templates_path = node_path.resolve(process.cwd(), 'templates');
let env = new nunjucks.Environment(new nunjucks.FileSystemLoader(templates_path));


nunjucks.precompile(templates_path, {env: env});

let security_group_rule_template = env.getTemplate('aws_security_group_rule.tf.jinja2');
let variable_template = env.getTemplate('variable.tf.jinja2');

module.exports = {
    security_group_rule_template: security_group_rule_template,
    variable_template: variable_template
};