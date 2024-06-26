"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const root_parser_1 = __importDefault(require("./root-parser"));
const structure_1 = require("../structure");
class IntegrationParser extends root_parser_1.default {
    /**
     * @param entries List of integrations
     * @param includeModuleLayerLayer
     */
    constructor(entries, includeModuleLayerLayer) {
        super(includeModuleLayerLayer);
        const integrations = entries.filter((e) => e.logtype === 'Integration');
        // Group all consumer or producer entries with the same method name together.
        // This assumes that consumer and producer use the same endpoint and method name
        // for such integration calls.
        const integrationsUniqueEndpointAndMethods = entries
            .map((e) => e.EndpointAndMethod)
            .filter((x, i, all) => i === all.findIndex((x2) => x === x2));
        const groupedIntegrations = integrationsUniqueEndpointAndMethods
            .map((method) => integrations.filter((e) => e.EndpointAndMethod === method));
        // Each set of entries needs to contain exactly one producer and at least one consumer
        const validGroupedIntegrations = groupedIntegrations.filter((group) => {
            const hasConsumer = group.some((e) => e.direction === 'REST (Consume)');
            const hasOneProducer = group.filter((e) => e.direction === 'REST (Expose)').length === 1;
            return hasConsumer && hasOneProducer;
        });
        validGroupedIntegrations
            .forEach((group) => this.parseGroupedIntegration(group));
    }
    /**
     * Parse a set of integrations that likely belong together as a set of dependencies.
     * Each group has exactly one REST (Expose) entry (the producer) and one or more
     * REST (Consume) entries (the consumers)
     * @param group
     * @private
     */
    parseGroupedIntegration(group) {
        const producer = group.find((e) => e.direction === 'REST (Expose)');
        if (producer === undefined)
            throw new Error('Producer not found');
        const consumers = group.filter((e) => e.direction === 'REST (Consume)');
        const prodModuleNode = this.getApplicationAndModule(producer.ApplicationName, producer.ModuleName);
        consumers.forEach((consumer) => {
            const consModuleNode = this.getApplicationAndModule(consumer.ApplicationName, consumer.ModuleName);
            const dependencyEdgeId = `${consModuleNode.data.id}__${prodModuleNode.data.id}`;
            const dependencyEdge = this.getDependencyEdge(dependencyEdgeId);
            if (dependencyEdge != null) {
                if (dependencyEdge.data.properties.nrDependencies != null) {
                    dependencyEdge.data.properties.nrDependencies += 1;
                }
                if (dependencyEdge.data.properties.nrCalls != null) {
                    dependencyEdge.data.properties.nrCalls += consumer.count;
                }
                dependencyEdge.data.properties.references.get('Integration').push(consumer.EndpointAndMethod);
            }
            else {
                this.dependencyEdges.push({
                    data: {
                        id: dependencyEdgeId,
                        source: consModuleNode.data.id,
                        target: prodModuleNode.data.id,
                        label: structure_1.RelationshipLabel.CALLS,
                        properties: {
                            references: new Map().set('Integration', [consumer.EndpointAndMethod]),
                            dependencyTypes: [structure_1.DependencyType.RUNTIME],
                            nrDependencies: 1,
                            nrCalls: consumer.count,
                        },
                    },
                });
            }
        });
    }
}
exports.default = IntegrationParser;
//# sourceMappingURL=integration-parser.js.map