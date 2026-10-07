import React from "react";
import { Flex, Menu } from "@mantine/core";
import { event as gaEvent } from "nextjs-google-analytics";
import { CgChevronDown } from "react-icons/cg";
import useFile from "../../../store/useFile";
import { useModal } from "../../../store/useModal";
import { StyledToolElement } from "./styles";

export const FileMenu = () => {
  const setVisible = useModal(state => state.setVisible);
  const getContents = useFile(state => state.getContents);
  const getFormat = useFile(state => state.getFormat);
  const activeTabId = useFile(state => state.activeTabId);
  const activeTabName = useFile(
    state => state.tabs.find(tab => tab.id === state.activeTabId)?.name ?? "Untitled"
  );
  const createTab = useFile(state => state.createTab);
  const markActiveTabSaved = useFile(state => state.markActiveTabSaved);

  const handleSave = () => {
    const a = document.createElement("a");
    const file = new Blob([getContents()], { type: "text/plain" });

    const objectUrl = window.URL.createObjectURL(file);
    a.href = objectUrl;
    a.download = activeTabName.includes(".") ? activeTabName : `${activeTabName}.${getFormat()}`;
    a.click();
    window.URL.revokeObjectURL(objectUrl);
    markActiveTabSaved();

    gaEvent("save_file", { label: getFormat(), tab_id: activeTabId });
  };

  return (
    <Menu shadow="md" withArrow>
      <Menu.Target>
        <StyledToolElement title="File">
          <Flex align="center" gap={3}>
            File
            <CgChevronDown />
          </Flex>
        </StyledToolElement>
      </Menu.Target>
      <Menu.Dropdown>
        <Menu.Item onClick={() => createTab()}>New</Menu.Item>
        <Menu.Item onClick={() => setVisible("ImportModal", true)}>Import</Menu.Item>
        <Menu.Item onClick={handleSave}>Export</Menu.Item>
      </Menu.Dropdown>
    </Menu>
  );
};
