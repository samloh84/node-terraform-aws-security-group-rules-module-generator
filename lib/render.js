const _ = require('lodash');
const nunjucks_util = require('./nunjucks_util');


let render = function (data) {
    let network_tiers = _.get(data, 'network_tiers');

    let security_groups = _.get(network_tiers, 'security_groups');
    let cidr_blocks = _.get(network_tiers, 'cidr_blocks');
    let ipv6_cidr_blocks = _.get(network_tiers, 'ipv6_cidr_blocks');
    let prefix_lists = _.get(network_tiers, 'prefix_lists');

    let grouped_traffic_rules = _.get(data, 'grouped_traffic_rules');

    let rendered_files = [];

    _.each(grouped_traffic_rules, function (security_group_rules, security_group_name) {
        let rendered_rules = _.map(security_group_rules, function (rule) {
            return nunjucks_util.security_group_rule_template.render(rule);
        });

        rendered_rules = rendered_rules.join('\n\n');


        rendered_files.push({
            file_name: `security_group_rules_${security_group_name}.tf`,
            file_contents: rendered_rules
        });
    });

    let variables = [];
    _.each(security_groups, function (security_group) {
        variables.push(nunjucks_util.variable_template.render({
            network_tier_name: _.get(security_group, 'name'),
            security_group_id: _.get(security_group, 'security_group_id'),
            type: 'security_group'
        }));
    });

    _.each(cidr_blocks, function (cidr_block) {
        variables.push(nunjucks_util.variable_template.render({
            network_tier_name: _.get(cidr_block, 'name'),
            cidr_blocks: _.get(cidr_block, 'cidr_blocks'),
            type: 'cidr_block'
        }));
    });

    _.each(ipv6_cidr_blocks, function (ipv6_cidr_block) {
        variables.push(nunjucks_util.variable_template.render({
            network_tier_name: _.get(ipv6_cidr_block, 'name'),
            ipv6_cidr_blocks: _.get(ipv6_cidr_block, 'ipv6_cidr_blocks'),
            type: 'ipv6_cidr_block'
        }));
    });

    _.each(prefix_lists, function (prefix_list) {
        variables.push(nunjucks_util.variable_template.render({
            network_tier_name: _.get(prefix_list, 'name'),
            prefix_list_ids: _.get(prefix_list, 'prefix_list_ids'),
            type: 'prefix_list'
        }));
    });


    variables = _.join(variables, '\n\n');
    rendered_files.push({file_name: `variables.tf`, file_contents: variables});


    return rendered_files;

};

module.exports = {
    render: render
};

