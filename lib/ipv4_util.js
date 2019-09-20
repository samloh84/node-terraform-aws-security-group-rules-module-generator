const _ = require('lodash');


const octet_regex = new RegExp('[0-9]|[1-9][0-9]|1[0-9][0-9]|2[0-4][0-9]|25[0-5]');
const ipv4_regex = new RegExp(`^(${octet_regex.source})\.(${octet_regex.source})\.(${octet_regex.source})\.(${octet_regex.source})$`);
const ipv4_cidr_regex = new RegExp(`^(?<ipv4>(${octet_regex.source})\.(${octet_regex.source})\.(${octet_regex.source})\.(${octet_regex.source}))\/(?<prefix>[0-9]|[1-2][0-9]|3[0-2])$`);


let validate_ipv4_cidr = function (cidr) {
    return ipv4_cidr_regex.test(cidr);
};
let validate_ipv4 = function (ipv4) {
    return ipv4_regex.test(ipv4);
};

let ipv4_to_int = function (ipv4) {
    let matches = ipv4_regex.exec(ipv4);
    if (_.isNil(ipv4)) {
        throw new Error(`Invalid IPV4 Address: ${ipv4}`);
    }
    let int = new Uint32Array(1);
    int[0] = 0;
    int[0] |= parseInt(matches[1], 10) << 24;
    int[0] |= parseInt(matches[2], 10) << 16;
    int[0] |= parseInt(matches[3], 10) << 8;
    int[0] |= parseInt(matches[4], 10);

    return int[0];
};

let int_to_ipv4 = function (int) {
    let octets = new Uint32Array(4);
    octets[0] = (Number(int) & 0xFF000000) >>> 24;
    octets[1] = (Number(int) & 0x00FF0000) >>> 16;
    octets[2] = (Number(int) & 0x0000FF00) >>> 8;
    octets[3] = (Number(int) & 0x000000FF);

    return `${octets[0]}.${octets[1]}.${octets[2]}.${octets[3]}`;
};

let generate_bitmask = function (start, end) {
    let uint_array = new Uint32Array(1);
    uint_array[0] = 0;
    for (let i = start; i <= end; i++) {
        uint_array[0] |= 1 << i;
    }
    return uint_array[0];
};


let cidr_prefix_to_int = function (prefix) {
    return generate_bitmask(32 - prefix, 32 - 1);
};

let flip_bitmask = function (int) {
    let uint_array = new Uint32Array(1);
    uint_array[0] = ~int;
    return uint_array[0];
};

let int_to_cidr_prefix = function (int) {
    for (let i = 0; i <= 32; i++) {
        if ((cidr_prefix_to_int(i) & int) === 0) {
            return i;
        }
    }
    return null;
};


let parse_cidr = function (cidr) {
    let matches = ipv4_cidr_regex.exec(cidr);
    if (_.isNil(cidr)) {
        throw new Error(`Invalid CIDR: ${cidr}`);
    }

    let ipv4 = matches.groups['ipv4'];
    let ipv4_int = ipv4_to_int(ipv4);
    let prefix = parseInt(matches.groups['prefix'], 10);
    let subnet_mask_int = cidr_prefix_to_int(prefix);
    let subnet_mask = int_to_ipv4(subnet_mask_int);
    let wildcard_mask_int = flip_bitmask(subnet_mask_int);
    let wildcard_mask = int_to_ipv4(wildcard_mask_int);

    let start_ipv4_int = ipv4_to_int(ipv4) & subnet_mask_int;
    let end_ipv4_int = start_ipv4_int | wildcard_mask_int;

    let start_ipv4 = int_to_ipv4(start_ipv4_int);
    let end_ipv4 = int_to_ipv4(end_ipv4_int);

    return {
        cidr: cidr,
        ipv4: ipv4,
        ipv4_int: ipv4_int,
        prefix: prefix,
        subnet_mask: subnet_mask,
        subnet_mask_int: subnet_mask_int,
        wildcard_mask: wildcard_mask,
        wildcard_mask_int: wildcard_mask_int,
        start_ipv4_int: start_ipv4_int,
        end_ipv4_int: end_ipv4_int,
        start_ipv4: start_ipv4,
        end_ipv4: end_ipv4,
    }
};


let ipv4_is_in_range = function (ipv4, ipv4_range) {
    let ipv4_int = ipv4_to_int(ipv4);
    let start_ipv4_int = ipv4_to_int(ipv4_range.start_ipv4);
    let end_ipv4_int = ipv4_to_int(ipv4_range.end_ipv4);
    return ipv4_int >= start_ipv4_int && ipv4_int <= end_ipv4_int;
};

let ipv4_is_in_cidr = function (ipv4, cidr) {
    let ipv4_int = ipv4_to_int(ipv4);
    let cidr_info = parse_cidr(cidr);
    return ipv4_int >= cidr_info.start_ipv4_int && ipv4_int <= cidr_info.end_ipv4_int;
};


let consolidate_ipv4_ranges = function (ipv4_ranges) {
    let consolidated_ipv4_ranges = [];

    _.each(ipv4_ranges, function (ipv4_range) {
        let parsed_ipv4_range = {
            start_ipv4_int: ipv4_to_int(ipv4_range.start_ipv4),
            end_ipv4_int: ipv4_to_int(ipv4_range.end_ipv4)
        };

        let overlap_index = _.findIndex(consolidated_ipv4_ranges, function (consolidated_ipv4_range) {
            return parsed_ipv4_range.start_ipv4_int <= consolidated_ipv4_range.end_ipv4_int
                && parsed_ipv4_range.end_ipv4_int <= consolidated_ipv4_range.start_ipv4_int;
        });

        if (overlap_index === -1) {
            consolidated_ipv4_ranges.push(parsed_ipv4_range);
        } else {
            let overlapping_ipv4_range = consolidated_ipv4_ranges[overlap_index];
            let start_ipv4_int = Math.min(parsed_ipv4_range.start_ipv4_int, overlapping_ipv4_range.start_ipv4_int);
            let end_ipv4_int = Math.max(parsed_ipv4_range.end_ipv4_int, overlapping_ipv4_range.end_ipv4_int);

            consolidated_ipv4_ranges[overlap_index] = {
                start_ipv4_int: start_ipv4_int,
                end_ipv4_int: end_ipv4_int
            }
        }
    });

    return _.map(consolidated_ipv4_ranges, function (consolidated_ipv4_range) {
        return {
            start_ipv4_int: consolidated_ipv4_range.start_ipv4_int,
            end_ipv4_int: consolidated_ipv4_range.end_ipv4_int,
            start_ipv4: int_to_ipv4(consolidated_ipv4_range.start_ipv4_int),
            end_ipv4: int_to_ipv4(consolidated_ipv4_range.end_ipv4_int)
        }
    })
};


let calculate_ipv4_range_subnet_mask = function (start_ipv4, end_ipv4) {
    let start_ipv4_int = ipv4_to_int(start_ipv4);
    let end_ipv4_int = ipv4_to_int(end_ipv4);
    let subnet_mask_int = flip_bitmask(start_ipv4_int) ^ end_ipv4_int;
    return int_to_ipv4(subnet_mask_int);
};

let subnet_mask_to_cidr_prefix = function (subnet_mask) {
    let subnet_mask_int = ipv4_to_int(subnet_mask);

    for (let i = 32; i >= 0; i--) {
        let cidr_prefix_int = cidr_prefix_to_int(i);
        if ((subnet_mask_int ^ cidr_prefix_int) === 0) {
            return i;
        }
    }

    return null;
};

let ipv4_range_to_cidr = function (start_ipv4, end_ipv4) {
    let subnet_mask = calculate_ipv4_range_subnet_mask(start_ipv4, end_ipv4);
    let cidr_prefix = subnet_mask_to_cidr_prefix(subnet_mask);

    if (cidr_prefix === null) {
        throw new Error(`Cannot convert ipv4 range to cidr: Invalid IP Range ${start_ipv4} to ${end_ipv4}`)
    }

    return `${start_ipv4}/${cidr_prefix}`;
};

module.exports = {
    consolidate_ipv4_ranges: consolidate_ipv4_ranges,
    ipv4_regex: ipv4_regex,
    octet_regex: octet_regex,
    ipv4_to_int: ipv4_to_int,
    ipv4_range_to_cidr: ipv4_range_to_cidr,
    int_to_cidr_prefix: int_to_cidr_prefix,
    ipv4_is_in_range: ipv4_is_in_range,
    parse_cidr: parse_cidr,
    cidr_prefix_to_int: cidr_prefix_to_int,
    flip_bitmask: flip_bitmask,
    subnet_mask_to_cidr_prefix: subnet_mask_to_cidr_prefix,
    calculate_ipv4_range_subnet_mask: calculate_ipv4_range_subnet_mask,
    int_to_ipv4: int_to_ipv4,
    validate_ipv4: validate_ipv4,
    generate_bitmask: generate_bitmask,
    validate_ipv4_cidr: validate_ipv4_cidr,
    ipv4_is_in_cidr: ipv4_is_in_cidr,
    ipv4_cidr_regex: ipv4_cidr_regex,
};



