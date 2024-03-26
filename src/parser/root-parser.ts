import {
  CoreLayerSublayers,
  Edge,
  EndUserLayerSublayers,
  formatName,
  formatName as format,
  FoundationLayerSublayers,
  GraphLayers,
  moduleColors,
  ModuleDependencyProfileCategory,
  ModuleLayers,
  ModuleSublayer,
  Node,
  RelationshipLabel,
} from '../structure';

export default class RootParser {
  public nodes: Node[] = [];

  public containEdges: Edge[] = [];

  public dependencyEdges: Edge[] = [];

  /**
   * @param includeModuleLayerLayer Whether a fifth layer between application and sublayer
   * (namely Layer) should be included in the resulting graph
   */
  constructor(protected includeModuleLayerLayer: boolean) {}

  public getNode(id: string) {
    return this.nodes.find((n) => n.data.id === id);
  }

  public getDependencyEdge(id: string) {
    return this.dependencyEdges.find((e) => e.data.id === id);
  }

  public getDomainId(domainName: string) {
    return format(`D_${domainName}`);
  }

  protected getApplicationId(applicationName: string) {
    return format(`A_${applicationName}`);
  }

  protected getApplicationWithLayerId(applicationId: string, layer?: ModuleLayers | string) {
    if (!layer) return applicationId;
    return format(`${applicationId}__${layer}`);
  }

  protected getApplicationWithSublayerId(
    applicationId: string,
    layer?: ModuleLayers | string,
    sublayer?: ModuleSublayer | string,
  ) {
    const applicationWithLayerId = this.getApplicationWithLayerId(applicationId, layer);
    if (!sublayer) return applicationWithLayerId;
    return format(`${applicationWithLayerId}__${sublayer}`);
  }

  protected getModuleId(applicationName: string, moduleName: string) {
    return format(`A_${applicationName}__M_${moduleName}`);
  }

  /**
   * Given the name of a module, extract the type of module based on its extension
   * If no explicit defined extension, the module will be of layer Enduser
   * @param moduleName
   */
  private moduleSuffixToLayers(moduleName: string): {
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

  /**
   * Create a domain node
   * @param domainName
   */
  public createDomainNode(domainName: string): Node {
    // If this entry is empty, skip this entry
    if (domainName === '') throw new Error('No domain name defined');

    // Create the ID. Skip this entry if the node already exists
    const id = this.getDomainId(domainName);

    return {
      data: {
        id,
        properties: {
          fullName: domainName,
          simpleName: domainName,
          color: '#7B7D7D',
          depth: 0,
          dependencyProfileCategory: ModuleDependencyProfileCategory.NONE,
          cohesion: 0,
        },
        labels: [GraphLayers.DOMAIN],
      },
    };
  }

  /**
   * Create an application node
   * @param applicationName
   */
  protected createApplicationNode(applicationName: string): Node {
    // If this entry is empty, skip this entry
    if (applicationName === '') throw new Error('No application name defined');

    // Create the ID. Skip this entry if the node already exists
    const id = this.getApplicationId(applicationName);

    return {
      data: {
        id,
        properties: {
          fullName: applicationName,
          simpleName: applicationName,
          color: '#7B7D7D',
          depth: 1,
          dependencyProfileCategory: ModuleDependencyProfileCategory.NONE,
          cohesion: 0,
        },
        labels: [GraphLayers.APPLICATION],
      },
    };
  }

  /**
   * Create a module node
   * @param applicationName
   * @param moduleName
   */
  protected createModuleNode(applicationName: string, moduleName: string): Node {
    // If this entry is empty, skip this entry
    if (moduleName === '') throw new Error('No module name defined');

    // Create the ID. Skip this entry if the node already exists
    const id = this.getModuleId(applicationName, moduleName);

    return {
      data: {
        id,
        properties: {
          fullName: moduleName,
          simpleName: moduleName,
          color: '#7B7D7D',
          depth: 4,
          dependencyProfileCategory: ModuleDependencyProfileCategory.HIDDEN,
        },
        labels: [GraphLayers.MODULE],
      },
    };
  }

  /**
   * Create a set of layer and sublayer nodes for each application node
   * @param applicationNodes
   */
  protected getApplicationModuleLayerNodesAndEdges(
    applicationNodes: Node[],
  ) {
    const nodes: Node[] = [];
    const edges: Edge[] = [];
    applicationNodes.forEach((applicationNode) => {
      Object.values(ModuleLayers).forEach((layer) => {
        let layerNode: Node | undefined;
        if (this.includeModuleLayerLayer) {
          layerNode = {
            data: {
              id: this.getApplicationWithLayerId(applicationNode.data.id, layer),
              properties: {
                fullName: `${applicationNode.data.properties.simpleName} ${layer}`,
                simpleName: layer,
                color: moduleColors[layer],
                depth: 3,
                dependencyProfileCategory: ModuleDependencyProfileCategory.NONE,
                cohesion: 0,
              },
              labels: [`layer_${layer}`, GraphLayers.LAYER],
            },
          };
          const layerEdge: Edge = {
            data: {
              id: formatName(`${layerNode.data.id}__contains`),
              source: applicationNode.data.id,
              target: layerNode.data.id,
              properties: {
                referenceType: 'Contains',
                referenceNames: ['Contains'],
              },
              label: RelationshipLabel.CONTAINS,
            },
          };
          nodes.push(layerNode);
          edges.push(layerEdge);
        }

        let subLayerKeys: string[];
        switch (layer) {
          case ModuleLayers.END_USER: subLayerKeys = Object.values(EndUserLayerSublayers); break;
          case ModuleLayers.CORE: subLayerKeys = Object.values(CoreLayerSublayers); break;
          case ModuleLayers.FOUNDATION:
            subLayerKeys = Object.values(FoundationLayerSublayers);
            break;
          default: subLayerKeys = []; break;
        }

        const subLayerNodes: Node[] = [];
        const subLayerEdges: Edge[] = [];
        subLayerKeys.forEach((subLayer) => {
          const subLayerNode: Node = ({
            data: {
              id: this.getApplicationWithSublayerId(applicationNode.data.id, layer, subLayer),
              properties: {
                fullName: `${applicationNode.data.properties.simpleName} ${subLayer}`,
                simpleName: subLayer,
                color: moduleColors[layer],
                depth: 3,
                dependencyProfileCategory: ModuleDependencyProfileCategory.NONE,
                cohesion: 0,
              },
              labels: [`Sublayer_${subLayer}`, GraphLayers.SUB_LAYER],
            },
          });

          const subLayerEdge: Edge = ({
            data: {
              id: formatName(`${subLayerNode.data.id}__contains`),
              source: layerNode ? layerNode.data.id : applicationNode.data.id,
              target: subLayerNode.data.id,
              properties: {
                referenceType: 'Contains',
                referenceNames: ['Contains'],
              },
              label: RelationshipLabel.CONTAINS,
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
   * Create a containment edge from source to target
   * @param source
   * @param target
   * @protected
   */
  public createContainEdge(source: Node, target: Node): Edge {
    return {
      data: {
        id: `${source.data.id}__${target.data.id}`,
        source: source.data.id,
        target: target.data.id,
        label: RelationshipLabel.CONTAINS,
        properties: {
          referenceType: 'Contains',
          referenceNames: ['Contains'],
        },
      },
    };
  }

  /**
   * Remove nodes and containment edges of (sub)layer nodes without any children in-place.
   * @returns new set of nodes and containment edges.
   */
  public trim(): { filteredNodes: Node[], filteredEdges: Edge[] } {
    /*
     * Trim sublayer nodes
     */
    let filteredNodes = this.nodes.filter((n) => {
      if (!n.data.labels.includes(GraphLayers.SUB_LAYER)) return true;
      // SubLayer node contains at least one module. If not, remove the node.
      return this.containEdges.some((e) => e.data.source === n.data.id);
    });
    let filteredEdges = this.containEdges.filter((e) => filteredNodes
      // All contain edges have a target node. We are specifically looking for nodes
      // that have a SubLayer-node as target, because we might have removed that node
      // just now.
      .some((n) => n.data.id === e.data.target));

    /*
     * Trim layer nodes (same methodology as above)
     */
    filteredNodes = filteredNodes.filter((n) => {
      if (!n.data.labels.includes(GraphLayers.LAYER)) return true;
      return filteredEdges.some((e) => e.data.source === n.data.id);
    });
    filteredEdges = filteredEdges.filter((e) => filteredNodes
      .some((n) => n.data.id === e.data.target));

    this.nodes = filteredNodes;
    this.containEdges = filteredEdges;

    return { filteredNodes, filteredEdges };
  }

  /**
   * Given a application with one of its module, return any new application nodes,
   * module nodes, and (sub)layer nodes with their containment edges
   * @param applicationName Name of the application
   * @param moduleName Name of the module
   * @param domainNode Optional domain node belonging to this application/module
   * @private
   * @returns Module node
   */
  protected getApplicationAndModule(
    applicationName: string,
    moduleName: string,
    domainNode?: Node,
  ): Node {
    const appId = this.getApplicationId(applicationName);
    let appNode = this.getNode(appId);
    if (!appNode) {
      appNode = this.createApplicationNode(applicationName);

      if (domainNode) {
        const domainContainEdge = this.createContainEdge(domainNode, appNode);
        this.containEdges.push(domainContainEdge);
      }

      const {
        nodes: layerNodes, edges: layerEdges,
      } = this.getApplicationModuleLayerNodesAndEdges([appNode]);
      this.nodes.push(appNode, ...layerNodes);
      this.containEdges.push(...layerEdges);
    }

    const moduleId = this.getModuleId(applicationName, moduleName);
    let moduleNode = this.getNode(moduleId);
    if (!moduleNode) {
      moduleNode = this.createModuleNode(applicationName, moduleName);

      const {
        layer: moduleLayer,
        sublayer: moduleSublayer,
      } = this.moduleSuffixToLayers(moduleName);
      const parentId = this.getApplicationWithSublayerId(appId, moduleLayer, moduleSublayer);
      const parentNode = this.getNode(parentId);
      if (!parentNode) {
        throw new Error(`Parent node with ID ${parentId} not found.`);
      }

      const containsEdge = this.createContainEdge(parentNode, moduleNode);

      this.nodes.push(moduleNode);
      this.containEdges.push(containsEdge);
    }

    return moduleNode;
  }

  /**
   * Color the child nodes based on what "contain" edge they have.
   * @param childNodes
   */
  protected colorNodeBasedOnParent(childNodes: Node[]): void {
    childNodes.forEach((moduleNode) => {
      const containEdge = this.containEdges.find((e) => e.data.target === moduleNode.data.id && e.data.label === 'contains');
      if (!containEdge) return;

      const parentNode = this.nodes.find((n) => n.data.id === containEdge.data.source);
      if (!parentNode) return;

      // eslint-disable-next-line no-param-reassign
      moduleNode.data.properties.color = parentNode.data.properties.color;
    });
  }
}
