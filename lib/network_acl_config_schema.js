const Joi = require('@hapi/joi');
const known_traffic_types = require('./known_traffic_types');
const yaml_util = require('./yaml_util');
const _ = require('lodash');

const subnet_group_schema = Joi.object().keys({
    name: Joi.string().required(),
    subnet_ids: Joi.array().items(Joi.string()).default(null),
    network_acl_id: Joi.string().default(null),
    allow_all_to_self: Joi.boolean().default(null),
    public: Joi.boolean().default(false),
    nat_gateway: Joi.boolean().default(false),
    ipv6: Joi.boolean().default(false)
});

const cidr_block_schema = Joi.object().keys({
    name: Joi.string().required(),
    cidr_blocks: Joi.array().items(Joi.string()).default(null)
});

const ipv6_cidr_block_schema = Joi.object().keys({
    name: Joi.string().required(),
    ipv6_cidr_blocks: Joi.array().items(Joi.string()).default(null)
});


const network_tiers_schema = Joi.object().keys({
    subnet_groups: Joi.array().items(subnet_group_schema).min(1),
    cidr_blocks: Joi.array().items(cidr_block_schema),
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
    allow_all_to_self: Joi.boolean().default(true),
    allow_ephemeral: Joi.boolean().default(true),
    ipv6: Joi.boolean().default(false),
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
    let allow_ephemeral = _.get(data, 'allow_ephemeral');
    let ipv6 = _.get(data, 'ipv6');

    let subnet_groups = _.get(network_tiers, 'subnet_groups');
    let cidr_blocks = _.get(network_tiers, 'cidr_blocks');
    let ipv6_cidr_blocks = _.get(network_tiers, 'ipv6_cidr_blocks');

    let subnet_group_names = _.map(subnet_groups, 'name');
    let cidr_block_names = _.map(cidr_blocks, 'name');
    let ipv6_cidr_block_names = _.map(ipv6_cidr_blocks, 'name');

    let public_subnet_group_names = _.map(_.filter(subnet_groups, 'public'), 'name');
    let private_subnet_group_names = _.map(_.reject(subnet_groups, 'public'), 'name');
    let nat_gateway_subnet_group_names = _.map(_.filter(subnet_groups, 'nat_gateway'), 'name');

    let all_network_tier_names = _.concat([], subnet_group_names, cidr_block_names, ipv6_cidr_block_names);

    function _get_network_tier(name) {
        let subnet_group = _.find(subnet_groups, {name: name});
        if (!_.isNil(subnet_group)) {
            return _.merge({type: 'subnet_group'}, subnet_group);
        }
        let cidr_block = _.find(cidr_blocks, {name: name});
        if (!_.isNil(cidr_block)) {
            return _.merge({type: 'cidr_block'}, cidr_block);
        }

        let ipv6_cidr_block = _.find(ipv6_cidr_blocks, {name: name});
        if (!_.isNil(ipv6_cidr_block)) {
            return _.merge({type: 'ipv6_cidr_block'}, ipv6_cidr_block);
        }

        return null;
    }

    let expanded_traffic_rules = [];

    _.each(subnet_groups, function (subnet_group) {
        let subnet_group_allow_all_to_self = _.get(subnet_group, 'allow_all_to_self');
        if (subnet_group_allow_all_to_self || allow_all_to_self) {
            traffic_rules.push({
                source: _.get(subnet_group, 'name'),
                destination: _.get(subnet_group, 'name'),
                traffic_type: 'all'
            });
        }
    });

    if (allow_ephemeral) {
        let ephemeral_traffic_rules = [];
        _.each(traffic_rules, function (traffic_rule) {
            ephemeral_traffic_rules.push({
                source: traffic_rule.destination,
                destination: traffic_rule.source,
                port: {
                    from: 1024,
                    to: 65535
                },
                protocol: 6
            });

            if (_.includes(private_subnet_group_names, traffic_rule.source) && (_.includes(cidr_block_names, traffic_rule.destination) || _.includes(ipv6_cidr_block_names, traffic_rule.destination))) {
                ephemeral_traffic_rules.push({
                    source: traffic_rule.source,
                    destination: nat_gateway_subnet_group_names,
                    port: traffic_rule.port,
                    traffic_type: traffic_rule.traffic_type,
                    protocol: traffic_rule.protocol
                });
            }
        });

        traffic_rules = _.concat([], traffic_rules, ephemeral_traffic_rules);
    }


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
        } else if (source_network_tier_names === 'all_subnet_groups') {
            source_network_tier_names = subnet_group_names;
        } else if (!_.isArray(source_network_tier_names)) {
            source_network_tier_names = [source_network_tier_names];
        }

        if (destination_network_tier_names === 'all') {
            destination_network_tier_names = all_network_tier_names;
        } else if (destination_network_tier_names === 'all_subnet_groups') {
            destination_network_tier_names = subnet_group_names;
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
    _.each(subnet_group_names, function (subnet_group_name) {
        let egress_rules = _.filter(expanded_traffic_rules, {source_network_tier: {name: subnet_group_name}});
        let ingress_rules = _.filter(expanded_traffic_rules, {destination_network_tier: {name: subnet_group_name}});

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

            if (egress_rule.other_network_tier.type === 'subnet_group' && (ipv6 || egress_rule.other_network_tier.ipv6)) {
                let ipv6_traffic_rule_name = `allow_ipv6_${egress_rule.traffic_type_name}_egress_from_${egress_rule.source_network_tier.name}_to_${egress_rule.destination_network_tier.name}`.replace(/[^a-z0-9]+/gi, '_');
                let ipv6_traffic_rule_description;
                if (!_.isNil(egress_rule.traffic_rule_description)) {
                    ipv6_traffic_rule_description = egress_rule.traffic_rule_description
                } else {
                    ipv6_traffic_rule_description = `Allow IPV6 ${egress_rule.traffic_type_name} egress from ${egress_rule.source_network_tier.name} to ${egress_rule.destination_network_tier.name}`
                }

                let egress_ipv6_rule = _.merge(_.cloneDeep(egress_rule), {
                    traffic_rule_name: ipv6_traffic_rule_name,
                    traffic_rule_description: ipv6_traffic_rule_description
                });
                _.set(egress_ipv6_rule, 'other_network_tier.type', 'ipv6_subnet_group');
                egress_rule_group.push(egress_ipv6_rule)
            }
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

            if (ingress_rule.other_network_tier.type === 'subnet_group' && (ipv6 || ingress_rule.other_network_tier.ipv6)) {
                let ipv6_traffic_rule_name = `allow_ipv6_${ingress_rule.traffic_type_name}_ingress_from_${ingress_rule.source_network_tier.name}_to_${ingress_rule.destination_network_tier.name}`.replace(/[^a-z0-9]+/gi, '_');
                let ipv6_traffic_rule_description;
                if (!_.isNil(ingress_rule.traffic_rule_description)) {
                    ipv6_traffic_rule_description = ingress_rule.traffic_rule_description
                } else {
                    ipv6_traffic_rule_description = `Allow IPV6 ${ingress_rule.traffic_type_name} ingress from ${ingress_rule.source_network_tier.name} to ${ingress_rule.destination_network_tier.name}`
                }

                let ingress_ipv6_rule = _.merge(_.cloneDeep(ingress_rule), {
                    traffic_rule_name: ipv6_traffic_rule_name,
                    traffic_rule_description: ipv6_traffic_rule_description
                });
                _.set(ingress_ipv6_rule, 'other_network_tier.type', 'ipv6_subnet_group');
                ingress_rule_group.push(ingress_ipv6_rule)
            }
        });
        
        _.set(grouped_traffic_rules, subnet_group_name, _.concat([], ingress_rule_group, egress_rule_group));
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