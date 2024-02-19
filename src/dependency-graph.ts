import { readFile, utils } from 'xlsx';
import fs from 'fs';
import {
  CoreLayerSublayers,
  EndUserLayerSublayers,
  FoundationLayerSublayers,
  ModuleLayers,
  ModuleSublayer,
  Node,
  Edge,
  Graph, moduleColors, formatName as format,
} from './structure';
import { edgeExists, nodeExists, validateGraph } from './graph';

interface ConsumerProducerEntry {
  'Cons Application': string // Consumer application
  'Cons Espace': string // Consumer module
  'Prod Application': string // Consumer application
  'Prod Espace': string // Consumer module
  'Reference Name': string
  'Reference Kind': string
  'Reference SS Key': string
}

interface ApplicationGroupEntry {
  ApplicationGroupName: string;
  ApplicationName: string;
  ModuleKind: string;
  ModuleName: string;
}

/**
 * Mapping from reference kind to edge labels
 * @param kind
 */
function consumerTypeToEdgeLabel(kind: string): string {
  switch (kind) {
    case 'Action': return 'calls';
    case 'Entity': return 'uses';
    case 'Structure': return 'uses';
    case 'ClientAction': return 'calls';
    case 'WebBlock': return 'renders';
    case 'StaticEntity': return 'uses';
    case 'Image': return 'uses';
    case 'Script': return 'uses';
    case 'Theme': return 'uses';
    case 'Role': return 'uses';
    case 'WebScreen': return 'renders';
    case 'Resource': return 'uses';
    case 'ClientEntity': return 'uses';
    case 'FlowExceptionHandlingFlow': return 'catches';
    case 'ServiceAPIMethod': return 'calls';
    case 'Process': return 'uses';
    default: return 'unknown';
  }
}

/**
 * Given the name of a module, extract the type of module based on its extension
 * If no explicit defined extension, the module will be of layer Enduser
 * @param moduleName
 */
function moduleSuffixToLayers(moduleName: string): {
  layer: ModuleLayers, sublayer: ModuleSublayer,
} {
  const suffix = moduleName.split('_').pop()?.toLowerCase();
  switch (suffix) {
    case 'api':
      return { layer: ModuleLayers.CORE, sublayer: CoreLayerSublayers.API };
    case 'cw':
      return { layer: ModuleLayers.CORE, sublayer: CoreLayerSublayers.CORE_WIDGETS };
    case 'cs':
      return { layer: ModuleLayers.CORE, sublayer: CoreLayerSublayers.CORE_SERVICE };
    case 'bl':
      return { layer: ModuleLayers.CORE, sublayer: CoreLayerSublayers.COMPOSITE_LOGIC };
    case 'theme':
    case 'thm':
    case 'th':
      return { layer: ModuleLayers.FOUNDATION, sublayer: FoundationLayerSublayers.STYLE_GUIDE };
    case 'is':
      return {
        layer: ModuleLayers.FOUNDATION,
        sublayer: FoundationLayerSublayers.FOUNDATION_SERVICE,
      };
    case 'lib':
      return { layer: ModuleLayers.FOUNDATION, sublayer: FoundationLayerSublayers.LIBRARY };
    default: break;
  }

  const prefix = moduleName.split('_').shift()?.toLowerCase();
  switch (prefix) {
    case 'cdm':
      return { layer: ModuleLayers.FOUNDATION, sublayer: FoundationLayerSublayers.LIBRARY };
    default: break;
  }

  return { layer: ModuleLayers.END_USER, sublayer: EndUserLayerSublayers.END_USER };
}

if (process.argv.length < 3) {
  throw new Error('Expected filename');
}

const consumerProducerWorkbook = readFile(process.argv[2]);
const consumerProducerEntries: ConsumerProducerEntry[] = utils
  .sheet_to_json(consumerProducerWorkbook.Sheets[consumerProducerWorkbook.SheetNames[0]]);

const applicationWorkbook = readFile(process.argv[3]);
const applicationEntries: ApplicationGroupEntry[] = utils
  .sheet_to_json(applicationWorkbook.Sheets[applicationWorkbook.SheetNames[0]]);

const createDomainId = (e: ApplicationGroupEntry) => format(`D_${e.ApplicationGroupName}`);
const createApplicationId = (e: ApplicationGroupEntry) => format(`A_${e.ApplicationName}`);
const createApplicationWithLayersId = (
  e: ApplicationGroupEntry,
  layer?: ModuleLayers,
  sublayer?: ModuleSublayer,
) => {
  if (!layer || !sublayer) return createApplicationId(e);
  return format(`A_${e.ApplicationName}__${layer}_${sublayer}`);
};
const createModuleId = (e: ApplicationGroupEntry) => format(`A_${e.ApplicationName}__M_${e.ModuleName}`);

/**
 * Convert the list of entities to a list of nodes
 * @param entries
 * @param createId
 * @param layer
 * @param layerName Label to use in the node
 * @param properties
 * @param createName
 */
function getNodes<T>(
  entries: T[],
  createId: (entry: T) => string,
  layer: keyof T,
  layerName: string,
  properties: { color: string, depth: number },
  createName?: (entry: T) => string,
): Node[] {
  const nodes: Node[] = [];

  entries.forEach((e) => {
    // If this entry is empty, skip this entry
    if (e[layer] === '') return;

    // Create the ID. Skip this entry if the node already exists
    const id = createId(e);
    if (nodeExists(nodes, id)) return;

    nodes.push({
      data: {
        id,
        properties: {
          ...properties,
          simpleName: createName ? createName(e) : id,
          kind: 'node',
          traces: [],
        },
        labels: [layerName],
      },
    });
  });

  return nodes;
}

/**
 * Create a set of layer and sublayer nodes for each application node
 * @param applicationNodes
 */
function getApplicationModuleLayerNodesAndEdges(applicationNodes: Node[]) {
  const nodes: Node[] = [];
  const edges: Edge[] = [];
  applicationNodes.forEach((applicationNode) => {
    Object.values(ModuleLayers).forEach((layer) => {
      let subLayerKeys: string[];
      switch (layer) {
        case ModuleLayers.END_USER: subLayerKeys = Object.values(EndUserLayerSublayers); break;
        case ModuleLayers.CORE: subLayerKeys = Object.values(CoreLayerSublayers); break;
        case ModuleLayers.FOUNDATION: subLayerKeys = Object.values(FoundationLayerSublayers); break;
        default: subLayerKeys = []; break;
      }

      const subLayerNodes: Node[] = [];
      const subLayerEdges: Edge[] = [];
      subLayerKeys.forEach((subLayer) => {
        const subLayerNode: Node = ({
          data: {
            id: format(`${applicationNode.data.id}__${layer}_${subLayer}`),
            properties: {
              simpleName: `Sublayer-${subLayer}`,
              kind: 'layer',
              traces: [],
              color: moduleColors[layer],
              depth: 3,
            },
            labels: [`Sublayer_${subLayer}`],
          },
        });

        const subLayerEdge: Edge = ({
          data: {
            id: format(`${applicationNode.data.id}__${subLayer}__contains`),
            source: applicationNode.data.id,
            target: subLayerNode.data.id,
            properties: {
              weight: 1,
              traces: [],
            },
            label: 'contains',
          },
        });

        subLayerNodes.push(subLayerNode);
        subLayerEdges.push(subLayerEdge);
      });

      nodes.push(...subLayerNodes);
      edges.push(...subLayerEdges);
    });
  });

  return { nodes, edges };
}

/**
 * Convert the list of entries to a list of edges
 * @param entries
 * @param sourceKey
 * @param targetKey
 * @param createSourceId
 * @param createTargetId
 * @param defaultSource Source node to use if an entry does not have a source node
 */
function getContainEdges<T>(
  entries: T[],
  sourceKey: keyof T,
  targetKey: keyof T,
  createSourceId: (entry: T, layer?: ModuleLayers, sublayer?: ModuleSublayer) => string,
  createTargetId: (entry: T) => string,
  defaultSource?: T,
): Edge[] {
  const edges: Edge[] = [];

  entries.forEach((e) => {
    // If the target does not exist, skip this entry
    if (e[targetKey] === '') {
      return;
    }
    let source: string;
    const target = createTargetId(e);

    if (e[sourceKey] === '' && !defaultSource) {
      return;
    } if (e[sourceKey] === '' && defaultSource) {
      source = createSourceId(defaultSource);
    } else {
      const {
        layer: targetLayer,
        sublayer: targetSublayer,
      } = moduleSuffixToLayers(e[targetKey] as string);
      source = createSourceId(e, targetLayer, targetSublayer);
    }

    // If the edge already exists, skip this entry
    if (edgeExists(edges, source, target)) return;
    edges.push({
      data: {
        id: `${source}__${target}`,
        source,
        target,
        label: 'contains',
        properties: {
          weight: 1,
          traces: [],
        },
      },
    });
  });

  return edges;
}

function getModuleEdges(entries: ConsumerProducerEntry[], nodes: Node[]): Edge[] {
  const edges: Edge[] = [];

  entries
    // Remove all possible edges that have no corresponding nodes
    .filter((e) => nodeExists(nodes, format(`A_${e['Cons Application']}__M_${e['Cons Espace']}`)))
    .filter((e) => nodeExists(nodes, format(`A_${e['Prod Application']}__M_${e['Prod Espace']}`)))
    // For each entry, add an aedge
    .forEach((entry) => {
      const source = format(`A_${entry['Cons Application']}__M_${entry['Cons Espace']}`);
      const target = format(`A_${entry['Prod Application']}__M_${entry['Prod Espace']}`);
      // Edge should not already exist
      if (edges.findIndex((e) => e.data.source === source && e.data.target === target) >= 0) return;

      const id = entry['Reference SS Key'];
      const idUsage = edges.filter((e) => e.data.id.startsWith(id)).length;
      edges.push({
        data: {
          // If the ID already exists, add a small suffix to prevent duplicates
          id: idUsage > 0 ? `${id}__${idUsage + 1}` : id,
          source,
          target,
          label: consumerTypeToEdgeLabel(entry['Reference Name']),
          properties: {
            weight: 1,
            traces: [],
          },
        },
      });
    });

  return edges;
}

/**
 * Color the module nodes based on what "contain" edge they have.
 * @param nodes
 * @param edges
 */
function colorModuleNodes(moduleNodes: Node[], edges: Edge[], allNodes: Node[]): Node[] {
  return moduleNodes.map((moduleNode) => {
    const containEdge = edges.find((e) => e.data.target === moduleNode.data.id && e.data.label === 'contains');
    if (!containEdge) return moduleNode;

    const sourceNode = allNodes.find((n) => n.data.id === containEdge.data.source);
    if (!sourceNode) return moduleNode;

    return {
      ...moduleNode,
      data: {
        ...moduleNode.data,
        properties: {
          ...moduleNode.data.properties,
          color: sourceNode.data.properties.color,
        },
      },
    } as Node;
  });
}

/**
 * Given a list of entries, create a labelled property graph from it
 */
function getGraph(): Graph {
  const entries = applicationEntries; // .filter((a) => a.ApplicationGroupName === 'MyService Agreements');

  const defaultDomainNode: ApplicationGroupEntry = {
    ApplicationGroupName: 'no_domain',
    ApplicationName: '',
    ModuleKind: 'eSpace',
    ModuleName: '',
  };

  const domainNodes = getNodes([...entries, defaultDomainNode], createDomainId, 'ApplicationGroupName', 'Domain', { color: '#7B7D7D', depth: 0 });
  const applicationNodes = getNodes(entries, createApplicationId, 'ApplicationName', 'Application', { color: '#7B7D7D', depth: 1 });
  const {
    nodes: layerNodes,
    edges: layerEdges,
  } = getApplicationModuleLayerNodesAndEdges(applicationNodes);
  const moduleNodes = getNodes(entries, createModuleId, 'ModuleName', 'Module', { color: '#7B7D7D', depth: 4 });

  const domainContains = getContainEdges(entries, 'ApplicationGroupName', 'ApplicationName', createDomainId, createApplicationId, defaultDomainNode);
  const applicationContains = getContainEdges(entries, 'ApplicationName', 'ModuleName', createApplicationWithLayersId, createModuleId);

  const coloredModuleNodes = colorModuleNodes(moduleNodes, applicationContains, layerNodes);

  const nodes = [...domainNodes, ...applicationNodes, ...coloredModuleNodes, ...layerNodes];
  const dependencyEdges = getModuleEdges(consumerProducerEntries, nodes);

  // Remove all sublayer nodes that do not have any children
  // (i.e. remove all sub layers that have no modules)
  let filteredLayerNodes = layerNodes.filter((n) => applicationContains
    .some((e) => e.data.source === n.data.id));
  // Remove all edges that no longer have a sublayer target
  let filteredLayerEdges = layerEdges.filter((e) => filteredLayerNodes
    .some((n) => e.data.target === n.data.id));
  // Remove all layer nodes that do not have any children
  // (i.e. remove all layers that have no sub layers)
  filteredLayerNodes = layerNodes.filter((n) => filteredLayerEdges
    .some((e) => e.data.source === n.data.id) || applicationContains
    .some((e) => e.data.source === n.data.id));
  // Remove all edges that no longer have a layer target
  filteredLayerEdges = layerEdges.filter((e) => filteredLayerNodes
    .some((n) => e.data.target === n.data.id));

  return {
    elements: {
      nodes: [...domainNodes, ...applicationNodes, ...filteredLayerNodes, ...coloredModuleNodes],
      edges: [...domainContains, ...filteredLayerEdges, ...applicationContains, ...dependencyEdges],
    },
  };
}

// eslint-disable-next-line import/prefer-default-export
export const graph = getGraph();
// eslint-disable-next-line no-console
console.log(`Generated LPG with ${graph.elements.nodes.length} nodes and ${graph.elements.edges.length} edges.`);

fs.writeFileSync('graph.json', JSON.stringify(graph, null, 4));
fs.writeFileSync('nodes.csv', graph.elements.nodes
  .map((n) => [n.data.id, n.data.labels[0]].map((x) => x.toString()).join(';'))
  .join('\n'));
fs.writeFileSync('relationships.csv', graph.elements.edges
  .map((n) => [n.data.id, n.data.label, n.data.source, n.data.target].map((x) => x.toString()).join(';'))
  .join('\n'));

validateGraph(graph);