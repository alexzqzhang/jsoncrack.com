import React from "react";
import type { ModalProps } from "@mantine/core";
import { TextInput } from "@mantine/core";
import { Modal, Stack, Text, ScrollArea, Flex, CloseButton, Button } from "@mantine/core";
import { CodeHighlight } from "@mantine/code-highlight";
import useFile from "../../../store/useFile";
import { useModal } from "../../../store/useModal";
import type { NodeData } from "../../../types/graph";
import useGraph from "../../editor/views/GraphView/stores/useGraph";

// return json path in the format $["customer"]
const jsonPathToString = (path?: NodeData["path"]) => {
  if (!path || path.length === 0) return "$";
  const segments = path.map(seg => (typeof seg === "number" ? seg : `"${seg}"`));
  return `$[${segments.join("][")}]`;
};

export const NodeEditModal = ({
  opened,
  onClose,
}: ModalProps & { initial?: string; onDone?: () => void }) => {
  const setVisible = useModal(state => state.setVisible);
  const selectedNode = useGraph(state => state.selectedNode);
  const [name, setName] = React.useState<string>("");
  const [color, setColor] = React.useState<string>("");

  // path: Array<string | number> - e.g. ['users', 0, 'name']
  // value: any - the replacement value to set at that path
  function setAtPath(root: any, path: Array<string | number> = [], value: any): any {
    // if path is empty -> replace whole document
    if (!path || path.length === 0) return value;

    // create a shallow copy of root to avoid mutating the original
    const result = Array.isArray(root) ? root.slice() : { ...root };

    let cur: any = result;
    for (let i = 0; i < path.length - 1; i++) {
      const seg = path[i];
      const nextSeg = path[i + 1];

      // if container at seg doesn't exist, create appropriate container (array vs object)
      if (cur[seg] == null) cur[seg] = typeof nextSeg === "number" ? [] : {};

      // ensure we shallow-copy the container so we don't mutate other references
      cur[seg] = Array.isArray(cur[seg])
        ? (cur[seg] as any[]).slice()
        : { ...(cur[seg] as object) };

      // descend
      cur = cur[seg];
    }

    // set the last segment
    const last = path[path.length - 1];
    cur[last] = value;

    return result;
  }

  // get value at path (returns undefined if not present)
  function getAtPath(root: any, path: Array<string | number> = []) {
    if (!path || path.length === 0) return root;
    let cur: any = root;
    for (const seg of path) {
      if (cur == null) return undefined;
      cur = cur[seg as any];
    }
    return cur;
  }

  // initialize the inputs from the selected node when the modal opens or selection changes
  React.useEffect(() => {
    if (!selectedNode) {
      setName("");
      setColor("");
      return;
    }

    // prefer primitive row values if present on the selected node
    const nRow = selectedNode.text?.find(r => r.key === "name");
    const cRow = selectedNode.text?.find(r => r.key === "color");

    setName(nRow?.value != null ? String(nRow.value) : "");
    setColor(cRow?.value != null ? String(cRow.value) : "");
  }, [selectedNode, opened]);

  const save = async () => {
    if (!selectedNode) return;
    try {
      const raw = useFile.getState().getContents();
      const json = JSON.parse(raw);
      const path = selectedNode.path ?? [];

      // build updates only from inputs
      const updates: Record<string, any> = {};
      if (name !== undefined) updates.name = name;
      if (color !== undefined) updates.color = color;

      // read current value at path
      const currentAtPath = getAtPath(json, path);

      let replacement: any;
      if (currentAtPath && typeof currentAtPath === "object" && !Array.isArray(currentAtPath)) {
        // merge into existing object
        replacement = { ...currentAtPath, ...updates };
      } else {
        // fallback: build replacement from node primitive rows plus updates
        const existing: Record<string, any> = (selectedNode.text || []).reduce(
          (acc: any, row) => {
            if (row.type !== "array" && row.type !== "object" && row.key) acc[row.key] = row.value;
            return acc;
          },
          {} as Record<string, any>
        );
        replacement = { ...existing, ...updates };
      }
      // build updated NodeRow[] for immediate UI update
      const updatedText = (selectedNode.text || []).map(row => {
        if (!row.key) return row; // skip unkeyed rows
        if (Object.prototype.hasOwnProperty.call(replacement, row.key)) {
          // only update primitive rows (keep object/array rows intact)
          if (row.type !== "object" && row.type !== "array") {
            return { ...row, value: replacement[row.key] };
          }
        }
        return row;
      });

      useGraph.getState().setSelectedNode({
        ...selectedNode,
        text: updatedText,
      });

      const updatedJson = setAtPath(json, path, replacement);
      await useFile.getState().setContents({ contents: JSON.stringify(updatedJson, null, 2) });

      setVisible("NodeEditModal", false);
      setVisible("NodeModal", true);
    } catch (err) {
      console.error("Failed to save node", err);
    }
  };
  return (
    <Modal size="auto" opened={opened} onClose={onClose} centered withCloseButton={false}>
      <Stack pb="sm" gap="sm">
        <Stack gap="xs">
          <Flex justify="space-between" align="center">
            <Text fz="xs" fw={500}>
              Content
            </Text>
            <Button color="red" onClick={onClose}>
              Cancel
            </Button>
            <Button
              color="green"
              onClick={() => {
                save();
              }}
            >
              Save
            </Button>
            <CloseButton onClick={onClose} />
          </Flex>
          <TextInput
            label="name"
            placeholder="Enter name"
            value={name}
            onChange={e => setName(e.currentTarget.value)} // update state on typing
          />
          <TextInput
            label="color"
            placeholder="Enter color"
            value={color}
            onChange={e => setColor(e.currentTarget.value)}
          />
        </Stack>
        <Text fz="xs" fw={500}>
          JSON Path
        </Text>
        <ScrollArea.Autosize maw={600}>
          <CodeHighlight
            code={jsonPathToString(selectedNode?.path)}
            miw={350}
            mah={250}
            language="json"
            copyLabel="Copy to clipboard"
            copiedLabel="Copied to clipboard"
            withCopyButton
          />
        </ScrollArea.Autosize>
      </Stack>
    </Modal>
  );
};
