import React from "react";
import { Group, Text } from "@mantine/core";
import { Dropzone } from "@mantine/dropzone";
import toast from "react-hot-toast";
import { VscCircleSlash, VscFiles } from "react-icons/vsc";
import useFile from "../../store/useFile";

export const FullscreenDropzone = () => {
  const openFiles = useFile(state => state.openFiles);

  return (
    <Dropzone.FullScreen
      accept={[
        "application/json",
        "application/x-yaml",
        "application/yaml",
        "text/yaml",
        "text/csv",
        "application/xml",
        "text/xml",
      ]}
      onReject={files => toast.error(`Unable to load file ${files[0].file.name}`)}
      onDrop={async files => {
        try {
          await openFiles(files);
        } catch (err) {
          toast.error("An error occurred while reading the file.");
          console.error(err);
        }
      }}
    >
      <Group
        justify="center"
        ta="center"
        align="center"
        gap="xl"
        h="100vh"
        style={{ pointerEvents: "none" }}
      >
        <Dropzone.Accept>
          <VscFiles size={100} />
          <Text fz="h1" fw={500} mt="lg">
            Upload to JSON Crack
          </Text>
          <Text fz="lg" c="dimmed" mt="sm">
            (Max file size: 300 KB)
          </Text>
        </Dropzone.Accept>
        <Dropzone.Reject>
          <VscCircleSlash size={100} />
          <Text fz="h1" fw={500} mt="lg">
            Invalid file
          </Text>
          <Text fz="lg" c="dimmed" mt="sm">
            Allowed formats are JSON, YAML, CSV, XML
          </Text>
        </Dropzone.Reject>
      </Group>
    </Dropzone.FullScreen>
  );
};
