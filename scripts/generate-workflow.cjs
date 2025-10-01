const fs = require('fs');
const path = require('path');

const workflowPath = path.join(__dirname, '../data/workflow/default.workflow.json');
const outputPath = path.join(__dirname, '../data/workflow/reference.sdxl.workflow.json');

const workflow = JSON.parse(fs.readFileSync(workflowPath, 'utf-8'));

const nodesMap = new Map();
const links = [];
let linkId = 1;

// First pass: collect all output requirements
const nodeOutputRequirements = new Map();

Object.entries(workflow).forEach(([nodeId, node]) => {
  if (!nodeOutputRequirements.has(nodeId)) {
    nodeOutputRequirements.set(nodeId, new Set());
  }

  if (node.inputs) {
    Object.values(node.inputs).forEach(val => {
      if (Array.isArray(val)) {
        const [sourceNodeId, sourceSlot] = val;
        if (!nodeOutputRequirements.has(sourceNodeId)) {
          nodeOutputRequirements.set(sourceNodeId, new Set());
        }
        nodeOutputRequirements.get(sourceNodeId).add(sourceSlot);
      }
    });
  }
});

// Second pass: create all nodes with empty outputs
Object.entries(workflow).forEach(([nodeId, node], index) => {
  const outputs = [];

  // Create outputs based on requirements
  const outputSlots = nodeOutputRequirements.get(nodeId) || new Set();
  const sortedSlots = Array.from(outputSlots).sort((a, b) => a - b);

  sortedSlots.forEach(slot => {
    outputs.push({
      name: `output_${slot}`,
      type: '*',
      links: [],
      slot_index: slot
    });
  });

  const nodeObj = {
    id: parseInt(nodeId),
    type: node.class_type,
    pos: [100 + (index % 5) * 420, 100 + Math.floor(index / 5) * 320],
    size: { 0: 320, 1: 100 },
    flags: {},
    order: index,
    mode: 0,
    inputs: [],
    outputs: outputs.length > 0 ? outputs : undefined,
    properties: { 'Node name for S&R': node.class_type },
    widgets_values: [],
    title: node._meta?.title || node.class_type
  };

  nodesMap.set(parseInt(nodeId), nodeObj);
});

// Third pass: create inputs and links, and update output links
Object.entries(workflow).forEach(([nodeId, node]) => {
  const targetNode = nodesMap.get(parseInt(nodeId));
  if (!targetNode) return;

  if (node.inputs) {
    Object.entries(node.inputs).forEach(([inputName, inputValue], inputIndex) => {
      if (Array.isArray(inputValue)) {
        const [sourceNodeId, sourceSlot] = inputValue;

        // Create link
        links.push([
          linkId,
          parseInt(sourceNodeId),
          sourceSlot,
          parseInt(nodeId),
          inputIndex,
          '*'
        ]);

        // Add link to source node's output
        const sourceNode = nodesMap.get(parseInt(sourceNodeId));
        if (sourceNode && sourceNode.outputs) {
          const output = sourceNode.outputs.find(o => o.slot_index === sourceSlot);
          if (output) {
            output.links.push(linkId);
          }
        }

        // Add input to target node
        targetNode.inputs.push({
          name: inputName,
          type: '*',
          link: linkId
        });

        linkId++;
      } else {
        targetNode.inputs.push({
          name: inputName,
          type: '*',
          link: null
        });
      }
    });
  }

  // Clean up empty inputs
  if (targetNode.inputs.length === 0) {
    delete targetNode.inputs;
  }
});

// Convert map to array and clean up slot_index
const nodes = Array.from(nodesMap.values());
nodes.forEach(node => {
  if (node.outputs) {
    node.outputs.forEach(o => delete o.slot_index);
  }
});

const fullWorkflow = {
  last_node_id: Math.max(...nodes.map(n => n.id)),
  last_link_id: linkId - 1,
  nodes,
  links,
  groups: [],
  config: {},
  extra: {},
  version: 0.4
};

fs.writeFileSync(outputPath, JSON.stringify(fullWorkflow, null, 2));
console.log('Generated workflow at:', outputPath);
console.log(`Created ${nodes.length} nodes and ${links.length} links`);
