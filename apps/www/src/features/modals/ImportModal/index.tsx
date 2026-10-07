import React from "react";
import type { ModalProps } from "@mantine/core";
import { Modal, Group, Button, TextInput, Stack, Paper, Text } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import toast from "react-hot-toast";
import { AiOutlineUpload } from "react-icons/ai";
import useFile from "../../../store/useFile";

export const ImportModal = ({ opened, onClose }: ModalProps) => {
  const [url, setURL] = React.useState("");
  const [files, setFiles] = React.useState<File[]>([]);

  const fetchUrl = useFile(state => state.fetchUrl);
  const openFiles = useFile(state => state.openFiles);

  const handleImportFile = async () => {
    if (url) {
      setFiles([]);
      toast.loading("Loading...", { id: "toastFetch" });
      await fetchUrl(url);
      toast.dismiss("toastFetch");
      setURL("");
      onClose();
    } else if (files.length) {
      await openFiles(files);
      setFiles([]);
      setURL("");
      onClose();
    }
  };

  return (
    <Modal
      title="Import File"
      opened={opened}
      onClose={() => {
        setFiles([]);
        setURL("");
        onClose();
      }}
      centered
    >
      <Stack py="sm">
        <TextInput
          value={url}
          onChange={e => setURL(e.target.value)}
          type="url"
          placeholder="URL of JSON to fetch"
          data-autofocus
        />
        <Paper radius="md" style={{ cursor: "pointer" }}>
          <Dropzone
            onDrop={setFiles}
            onReject={files => toast.error(`Unable to load file ${files[0].file.name}`)}
            p="md"
            accept={[
              "application/json",
              "application/x-yaml",
              "application/yaml",
              "text/yaml",
              "text/csv",
              "application/xml",
              "text/xml",
            ]}
          >
            <Stack justify="center" align="center" gap="sm" mih={220}>
              <AiOutlineUpload size={48} />
              <Text fw="bold">Drop here or click to upload files</Text>
              <Text c="dimmed" fz="sm">
                {files.length ? files.map(file => file.name).join(", ") : "None"}
              </Text>
            </Stack>
          </Dropzone>
        </Paper>
      </Stack>
      <Group justify="right">
        <Button onClick={handleImportFile} disabled={!(files.length || url)}>
          Import
        </Button>
      </Group>
    </Modal>
  );
};
