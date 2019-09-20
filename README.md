# Node Terraform AWS Security Group Rules Module Generator

The Node Terraform AWS Security Group Rules Module Generator is a utility 
script to generate 
a parameterized Terraform Module containing Security Group Rules from a 
supplied configuration YAML file.

The generated module is parameterized to accept Security Group IDs, as well as 
IPV4 and IPV6 CIDR blocks and Prefix Lists.

## Concept
For the scope of this project, we view the architecture of a system to be a 
[multi-tiered architecture][wikipedia-multitier-architecture].

We generalize the different network entities to belong to a network tier. 
For this project, a Security Group is associated with a network tier. 
Other Security Group targets, such as external IPv4 and IPv6 CIDR blocks and 
prefix ID lists are represented as network tiers.

A Security Group rule is an explicit allowing of traffic through a port range 
and a protocol between two network tiers.

The collection of Security Group rules can be viewed as a 
[directed acyclic graph][wikipedia-directed-acyclic-graph], with the 
network tiers mapped as vertices and the rules mapped as edges of the graph. 
For the scope of this project, the DAG is useful  as a data structure.

The configuration file lists the network tiers and traffic rules, along with 
any configurations required for the generation of the Terraform module.

The utility script generates both Security Group ingress and egress rules 
according to the traffic rules defined in the configuration file.  

## Installation

1. Clone this repository using Git.

    ```bash
    git clone https://github.com/samloh84/node-terraform-aws-security-group-rules-module-generator
    ```

2. Use NPM to install the dependencies required for this script. 

    ```bash
    npm install
    ```

## Usage

1. Define your network tiers and network traffic rules in the `config.yml` file.

2. Run the following command to generate the Terraform scripts in the `output` directory.
```bash
node index.js
```

You can also specify a different configuration in a different file. Running the 
command on the different configuration file will create a corresponding 
directory in the `output` directory.
```bash
node index.js <configuration file>
```
 
## Config Schema

config_schema: 
* network_tiers - network_tiers_schema - Required. Object describing the different network tiers.
* traffic_rules - Array(traffic_rule_schema) - Required. Minimum of 1. Array listing the traffic rules.
* allow_all_to_self - Boolean - Optional. Defaults to true. If true, the script adds rules to allow all traffic for each Security Group from itself.

network_tiers_schema:
* security_groups - Array(security_group_schema) - Required. Minimum of 1. Array listing Security Group network tiers.
* cidr_blocks - Array(cidr_block_schema) - Optional. Array listing CIDR block network tiers
* prefix_lists - Array(prefix_list_schema) - Optional. Array listing Prefix List network tiers
* ipv6_cidr_blocks - Array(ipv6_cidr_block_schema) - Optional. Array listing IPv6 CIDR block network tiers

security_group_schema:
* name - String - Required. Name of network tier.
* description - String - Optional. Description of network tier.
* allow_all_to_self - Boolean - Optional. If allow_all_to_self is disabled globally, this can be set to true to allow all traffic for the Security Group from itself.
* security_group_id - String - Optional. If the Security Group ID is known, it can be supplied as a default to the network tier Security Group ID parameter.


cidr_block_schema:
* name - String - Required. Name of network tier.
* cidr_blocks - Array(String) - Optional. If the CIDR Blocks are known, it can be supplied as a default to the network tier CIDR blocks parameter.


ipv6_cidr_block_schema:
* name - String - Required. Name of network tier.
* ipv6_cidr_blocks - Array(String) - Optional. If the IPV6 CIDR Blocks are known, it can be supplied as a default to the network tier IPV6 CIDR blocks parameter.


prefix_list_schema:
* name - String - Required. Name of network tier.
* prefix_list_ids - Array(String) - Optional. If the Prefix List Ids are known, it can be supplied as a default to the network tier Prefix List IDs parameter.

traffic_rule_schema:
* port - Integer | port_schema | Array(Integer | port_schema)  - Optional. Describes the port range of the traffic rule. Specify an array to specify multiple port ranges.
* protocol - String - Optional. Describes the traffic protocol of the traffic rule.
* traffic_type - String - Optional. Describes the traffic type of the traffic rule. Known traffic types like https and ssh have standard port ranges and protocols. If specified, overrides specified port and protocol values. If all traffic_type, port and protocol values are unspecified, the traffic rule defaults to allow all traffic. Specify an array to specify multiple traffic types.    
* description - String - Optional. Description of the traffic rule.
* source - String | Array(String) - Required. Source Network Tier Name.  Specify an array to target multiple network tiers. Convenience values like 'all' and 'all_security_groups' target corresponding multiple network tiers. 
* destination - String - | Array(String) - Required. Destination Network Tier Name. Specify an array to target multiple network tiers. Convenience values like 'all' and 'all_security_groups' target corresponding multiple network tiers.

port_schema:
* from - Integer - From port
* to - Integer - To port

## Notes on AWS Security Groups
Do note that AWS imposes limits on the number of Security Groups and 
Network ACLs, as well as the number of ingress and egress rules in each 
Security Group or Network ACL. See the AWS documentation on 
[Amazon VPC Limits][amazon-vpc-limits].

The default limit of ingress rules and egress rules for Security Groups is 60. 
The generated resources may exceed these limits, so modify your configuration 
accordingly. 

## References
[Terraform AWS Provider Reference - Security Group Rule][terraform-aws-security-group-rule]


[wikipedia-multitier-architecture]: https://en.wikipedia.org/wiki/Multitier_architecture
[wikipedia-directed-acyclic-graph]: https://en.wikipedia.org/wiki/Directed_acyclic_graph
[amazon-vpc-limits]: https://docs.aws.amazon.com/en_pv/vpc/latest/userguide/amazon-vpc-limits.html
[terraform-aws-security-group-rule]: https://www.terraform.io/docs/providers/aws/r/security_group_rule.html
