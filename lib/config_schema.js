const Joi = require('@hapi/joi');
const known_traffic_types = require('./known_traffic_types');
const yaml_util = require('./yaml_util');
const _ = require('lodash');

const security_group_schema = Joi.object().keys({
    name: Joi.string().required(),
    description: Joi.string(),
    allow_all_to_self: Joi.boolean().default(true),
    security_group_id: Joi.string()
});

const cidr_block_schema = Joi.object().keys({
    name: Joi.string().required(),
    cidr_blocks: Joi.array().items(Joi.string()).default(null)
});

const ipv6_cidr_block_schema = Joi.object().keys({
    name: Joi.string().required(),
    ipv6_cidr_blocks: Joi.array().items(Joi.string()).default(null)
});


const prefix_list_schema = Joi.object().keys({
    name: Joi.string().required(),
    prefix_list_ids: Joi.array().items(Joi.string()).default(null)
});

const network_tiers_schema = Joi.object().keys({
    security_groups: Joi.array().items(security_group_schema).required().min(1),
    cidr_blocks: Joi.array().items(cidr_block_schema),
    prefix_lists: Joi.array().items(prefix_list_schema),
    ipv6_cidr_blocks: Joi.array().items(ipv6_cidr_block_schema),
});

const port_schema = Joi.alternatives().try(Joi.number().integer(), Joi.object().keys({
    from: Joi.number().integer().required(),
    to: Joi.number().integer().required()
}));


const traffic_rule_schema = Joi.object().keys({
    port: Joi.alternatives().try(port_schema, Joi.array().items(port_schema).min(1)),
    protocol: Joi.string(),
    traffic_type: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string()).min(1)),
    description: Joi.string(),
    source: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string()).min(1)).required(),
    destination: Joi.alternatives().try(Joi.string(), Joi.array().items(Joi.string()).min(1)).required()
});


const config_schema = Joi.object().keys({
    network_tiers: network_tiers_schema.required(),
    traffic_rules: Joi.array().items(traffic_rule_schema).required().min(1),
    allow_all_to_self: Joi.boolean().default(true)
});



let validate = function (data) {
    let results = config_schema.validate(data);
    if (!_.isNil(results.error)) {
        throw results.error;
    } else {
        return results.value;
    }
};



let process_traffic_rules = function (data) {
    let network_tiers = _.get(data, 'network_tiers');
    let traffic_rules = _.get(data, 'traffic_rules');
    let allow_all_to_self = _.get(data, 'allow_all_to_self');

    let security_groups = _.get(network_tiers, 'security_groups');
    let cidr_blocks = _.get(network_tiers, 'cidr_blocks');
    let ipv6_cidr_blocks = _.get(network_tiers, 'ipv6_cidr_blocks');
    let prefix_lists = _.get(network_tiers, 'prefix_lists');

    let security_group_names = _.map(security_groups, 'name');
    let cidr_block_names = _.map(cidr_blocks, 'name');
    let ipv6_cidr_block_names = _.map(ipv6_cidr_blocks, 'name');
    let prefix_list_names = _.map(prefix_lists, 'name');

    let all_network_tier_names = _.concat([], security_group_names, cidr_block_names, ipv6_cidr_block_names, prefix_list_names);

    function _get_network_tier(name) {
        let security_group = _.find(security_groups, {name: name});
        if (!_.isNil(security_group)) {
            return _.merge({type: 'security_group'}, security_group);
        }
        let cidr_block = _.find(cidr_blocks, {name: name});
        if (!_.isNil(cidr_block)) {
            return _.merge({type: 'cidr_block'}, cidr_block);
        }

        let ipv6_cidr_block = _.find(ipv6_cidr_blocks, {name: name});
        if (!_.isNil(ipv6_cidr_block)) {
            return _.merge({type: 'ipv6_cidr_block'}, ipv6_cidr_block);
        }
        let prefix_list = _.find(prefix_lists, {name: name});
        if (!_.isNil(prefix_list)) {
            return _.merge({type: 'prefix_list'}, prefix_list);
        }

        return null;
    }

    let expanded_traffic_rules = [];

    _.each(security_groups, function (security_group) {
        let security_group_allow_all_to_self = _.get(security_group, 'allow_all_to_self');
        if (security_group_allow_all_to_self || allow_all_to_self) {
            traffic_rules.push({
                source: _.get(security_group, 'name'),
                destination: _.get(security_group, 'name'),
                traffic_type: 'all'
            });
        }
    });


    _.each(traffic_rules, function (traffic_rule) {
        let ports = _.get(traffic_rule, 'port');
        let traffic_types = _.get(traffic_rule, 'traffic_type');
        let protocol = _.get(traffic_rule, 'protocol');

        let protocol_name;
        if (_.isInteger(protocol)) {
            protocol_name = known_traffic_types.identify_protocol(protocol);
        } else {
            protocol_name = protocol;
        }

        if (_.isNil(ports) && _.isNil(traffic_types)) {
            traffic_types = 'all';
        }


        let expanded_traffic_types = {};

        if (!_.isNil(traffic_types)) {
            if (!_.isArray(traffic_types)) {
                traffic_types = [traffic_types];
            }

            if (_.includes(traffic_types, 'all')) {
                traffic_types = ['all'];
            } else if (_.includes(traffic_types, 'all_tcp')) {
                traffic_types = ['all_tcp'];
            } else if (_.includes(traffic_types, 'all_udp')) {
                traffic_types = ['all_udp'];
            }

            _.each(traffic_types, function (traffic_type_name) {
                let traffic_type = known_traffic_types.get_traffic_type(traffic_type_name);
                if (_.isNil(traffic_type)) {
                    throw new Error(`Invalid traffic type: ${traffic_type_name}`);
                }
                _.set(expanded_traffic_types, traffic_type_name, traffic_type);
            });
        }

        if (!_.isNil(ports)) {
            if (!_.isArray(ports)) {
                ports = [ports];
            }

            _.each(ports, function (port) {
                let from_port, to_port, traffic_type, traffic_type_name;

                if (_.isPlainObject(port)) {
                    from_port = _.get(port, 'from');
                    to_port = _.get(port, 'to');
                } else {
                    from_port = port;
                    to_port = port;
                }
                traffic_type = {
                    from_port: from_port,
                    to_port: to_port,
                    protocol: protocol
                };

                traffic_type_name = known_traffic_types.identify_traffic_type(traffic_type);

                if (_.isNil(traffic_type_name)) {
                    if (from_port === to_port) {
                        traffic_type_name = `protocol_${protocol_name}_port_${from_port}`
                    } else {
                        traffic_type_name = `protocol_${protocol_name}_from_port_${from_port}_to_port_${to_port}`
                    }
                }

                _.set(expanded_traffic_types, traffic_type_name, traffic_type);
            });
        }


        let traffic_rule_description = _.get(traffic_rule, 'description');
        let source_network_tier_names = _.get(traffic_rule, 'source');
        let destination_network_tier_names = _.get(traffic_rule, 'destination');

        if (source_network_tier_names === 'all') {
            source_network_tier_names = all_network_tier_names;
        } else if (source_network_tier_names === 'all_security_groups') {
            source_network_tier_names = security_group_names;
        } else if (!_.isArray(source_network_tier_names)) {
            source_network_tier_names = [source_network_tier_names];
        }

        if (destination_network_tier_names === 'all') {
            destination_network_tier_names = all_network_tier_names;
        } else if (destination_network_tier_names === 'all_security_groups') {
            destination_network_tier_names = security_group_names;
        } else if (!_.isArray(destination_network_tier_names)) {
            destination_network_tier_names = [destination_network_tier_names];
        }

        let source_network_tiers = _.map(source_network_tier_names, function (source_network_tier_name) {
            let source_network_tier = _get_network_tier(source_network_tier_name);
            if (_.isNil(source_network_tier)) {
                throw new Error(`Unknown source network tier: ${source_network_tier_name}`);
            }

            return source_network_tier;
        });

        let destination_network_tiers = _.map(destination_network_tier_names, function (destination_network_tier_name) {
            let destination_network_tier = _get_network_tier(destination_network_tier_name);
            if (_.isNil(destination_network_tier)) {
                throw new Error(`Unknown destination network tier: ${destination_network_tier_name}`);
            }

            return destination_network_tier;
        });


        _.each(source_network_tiers, function (source_network_tier) {
            _.each(destination_network_tiers, function (destination_network_tier) {
                _.each(expanded_traffic_types, function (traffic_type, traffic_type_name) {
                    let expanded_traffic_rule = {
                        source_network_tier: source_network_tier,
                        destination_network_tier: destination_network_tier,
                        from_port: traffic_type.from_port,
                        to_port: traffic_type.to_port,
                        protocol: traffic_type.protocol,
                        protocol_name: protocol_name,
                        traffic_type: traffic_type_name,
                        traffic_type_name: traffic_type_name,
                        traffic_rule_description: traffic_rule_description
                    };
                    expanded_traffic_rules.push(expanded_traffic_rule)
                })

            });
        });
    });

    expanded_traffic_rules = _.uniqWith(expanded_traffic_rules, function (a, b) {
        let props = ['source_network_tier', 'destination_network_tier', 'from_port', 'to_port', 'protocol', 'traffic_type'];
        return _.isEqual(_.pick(a, props), _.pick(b, props));
    });

    let grouped_traffic_rules = {};
    _.each(security_group_names, function (security_group_name) {
        let egress_rules = _.filter(expanded_traffic_rules, {source_network_tier: {name: security_group_name}});
        let ingress_rules = _.filter(expanded_traffic_rules, {destination_network_tier: {name: security_group_name}});

        let egress_rule_group = [];
        _.each(egress_rules, function (egress_rule) {
            let traffic_rule_name = `allow_${egress_rule.traffic_type_name}_egress_from_${egress_rule.source_network_tier.name}_to_${egress_rule.destination_network_tier.name}`.replace(/[^a-z0-9]+/gi, '_');
            let traffic_rule_description;
            if (!_.isNil(egress_rule.traffic_rule_description)) {
                traffic_rule_description = egress_rule.traffic_rule_description
            } else {
                traffic_rule_description = `Allow ${egress_rule.traffic_type_name} egress from ${egress_rule.source_network_tier.name} to ${egress_rule.destination_network_tier.name}`
            }

            egress_rule = _.merge(_.cloneDeep(egress_rule), {
                traffic_rule_name: traffic_rule_name,
                traffic_rule_description: traffic_rule_description,
                traffic_rule_type: 'egress',
                network_tier: egress_rule.source_network_tier,
                other_network_tier: egress_rule.destination_network_tier
            });
            egress_rule_group.push(egress_rule);
        });

        let ingress_rule_group = [];
        _.each(ingress_rules, function (ingress_rule) {
            let traffic_rule_name = `allow_${ingress_rule.traffic_type_name}_ingress_from_${ingress_rule.source_network_tier.name}_to_${ingress_rule.destination_network_tier.name}`.replace(/[^a-z0-9]+/gi, '_');
            let traffic_rule_description;
            if (!_.isNil(ingress_rule.traffic_rule_description)) {
                traffic_rule_description = ingress_rule.traffic_rule_description
            } else {
                traffic_rule_description = `Allow ${ingress_rule.traffic_type_name} ingress from ${ingress_rule.source_network_tier.name} to ${ingress_rule.destination_network_tier.name}`
            }

            ingress_rule = _.merge(_.cloneDeep(ingress_rule), {
                traffic_rule_name: traffic_rule_name,
                traffic_rule_description: traffic_rule_description,
                traffic_rule_type: 'ingress',
                network_tier: ingress_rule.destination_network_tier,
                other_network_tier: ingress_rule.source_network_tier
            });
            ingress_rule_group.push(ingress_rule);

        });

        _.set(grouped_traffic_rules, security_group_name, _.concat([], ingress_rule_group, egress_rule_group));
    });

    return {
        expanded_traffic_rules: expanded_traffic_rules,
        grouped_traffic_rules: grouped_traffic_rules
    };
};

let load = function (path) {
    return yaml_util.read_yaml(path)
        .then(function (data) {
            return validate(data)
        })
        .then(function (data) {
            return _.merge({}, data, process_traffic_rules(data));
        })
};


module.exports = {
    config_schema: config_schema,
    process_traffic_rules: process_traffic_rules,
    load: load
};