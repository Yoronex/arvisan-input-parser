import neo4j from 'neo4j-driver';
import { Edge, Graph, Node } from './structure';
import { graph } from './dependency-graph';
import { getViolationsAsGraph } from './violations';

const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', ''));

function createNodeQuery(n: Node): string {
  const propertiesString = Object.keys(n.data.properties)
    .filter((key) => !['traces'].includes(key))
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    .map((key) => `${key}: ${JSON.stringify(n.data.properties[key])}`).join(', ');
  return `(${n.data.id}:${n.data.labels[0]} {id: '${n.data.id}', ${propertiesString}})`;
}

function createEdgeQuery(e: Edge, nodes: Node[]): string {
  const source = nodes.find((n) => n.data.id === e.data.source);
  const target = nodes.find((n) => n.data.id === e.data.target);
  if (source == null || target == null) throw new Error('Source and/or target nodes do not exist');
  return `(${e.data.source})-[:${e.data.label.toUpperCase()} {id: '${e.data.id}'}]->(${e.data.target})`;
}

function createQuery(g: Graph): string {
  return `CREATE ${g.elements.nodes.map((n) => createNodeQuery(n)).join(', ')}, ${g.elements.edges.map((e) => createEdgeQuery(e, g.elements.nodes))}`;
}

async function injectGraph() {
  const session = driver.session();
  try {
    await session.run('MATCH (n) DETACH delete n');
  } catch (e) {
    console.error(`Could not delete graph: ${e}`);
    await session.close();
    await driver.close();
    return;
  }

  try {
    await session.run(createQuery(graph));
    await session.run(createQuery(getViolationsAsGraph()));
    // await Promise.all(graph.elements.edges.map(async (edge) => {
    //   const session = driver.session();
    //   await session.run(createEdgeQuery(edge, graph.elements.nodes));
    //   await session.close();
    // }));
    await session.run;
    console.log('Seeded database');
  } catch (e) {
    console.error(`Could not inject graph: ${e}`);
  } finally {
    await session.close();
    await driver.close();
  }
}

console.log('Seeding Neo4j database...');
injectGraph().then(() => {
  process.exit(0);
});