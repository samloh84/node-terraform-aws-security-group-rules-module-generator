const _ = require('lodash');
let known_traffic_types = {
    all: {
        from_port: 0,
        to_port: 65535,
        protocol: -1
    },
    all_tcp: {
        from_port: 0,
        to_port: 65535,
        protocol: 6
    },
    all_udp: {
        from_port: 0,
        to_port: 65535,
        protocol: 17
    },
    icmp: {
        from_port: 0,
        to_port: 65535,
        protocol: 1
    },
    icmp_ipv6: {
        from_port: 0,
        to_port: 65535,
        protocol: 58
    },
    ssh: 22,
    smtp: 25,
    dns_udp: {protocol: 17, port: 53},
    dns: 53,
    http: 80,
    pop3: 110,
    imap: 143,
    ldap: 389,
    https: 443,
    smb: 445,
    smtps: 465,
    imaps: 993,
    pop3s: 995,
    mssql: 1433,
    nfs: 2049,
    mysql: 3306,
    aurora: 3306,
    rdp: 3389,
    redshift: 5439,
    postgresql: 5432,
    oracle: 1521,
    winrm_http: 5985,
    winrm_https: 5986,
    elastic_graphics: 2007
};

let protocol_numbers = {
    icmp: 1,
    tcp: 6,
    udp: 17,
    icmp_ipv6: 58
};

let get_traffic_type = function (name) {
    let traffic_type = _.get(known_traffic_types, name);
    if (_.isNil(traffic_type)) {
        throw new Error(`Unknown traffic type: ${name}`);
    }
    return _.merge({name: name}, normalize_traffic_type(traffic_type));
};

let normalize_traffic_type = function (traffic_type) {
    if (_.isInteger(traffic_type)) {
        traffic_type = {
            from_port: traffic_type,
            to_port: traffic_type,
            protocol: 6
        };
    } else if (_.isPlainObject(traffic_type)) {
        traffic_type = {
            from_port: _.get(traffic_type, 'from_port', _.get(traffic_type, 'port')),
            to_port: _.get(traffic_type, 'to_port', _.get(traffic_type, 'port')),
            protocol: _.get(traffic_type, 'protocol', 6)
        };
    } else {
        throw new Error("Invalid traffic type ${traffic_type}");
    }
    return traffic_type;
};

let identify_traffic_type = function (port) {
    port = normalize_traffic_type(port);
    return _.findKey(known_traffic_types, function (traffic_type) {
        return _.isEqual(port, normalize_traffic_type(traffic_type));
    });

};

let get_protocol_number = function (name) {
    let protocol_number = _.get(protocol_numbers, name);
    if (_.isNil(protocol_number)) {
        throw new Error(`Unknown protocol: ${name}`);
    }
    return protocol_number;
};

let identify_protocol = function (protocol_number) {
    return _.findKey(protocol_numbers, protocol_number);
};

module.exports = {
    traffic_types: known_traffic_types,
    protocol_numbers: protocol_numbers,
    get_traffic_type: get_traffic_type,
    normalize_traffic_type: normalize_traffic_type,
    identify_traffic_type: identify_traffic_type,
    get_protocol_number: get_protocol_number,
    identify_protocol: identify_protocol
};