import React from "react";
import styled from "styled-components";
import { VscAdd, VscClose } from "react-icons/vsc";
import useFile from "../../store/useFile";

const Bar = styled.div`
  display: flex;
  min-height: 36px;
  overflow-x: auto;
  overflow-y: hidden;
  border-bottom: 1px solid ${({ theme }) => theme.BACKGROUND_MODIFIER_ACCENT};
  background: ${({ theme }) => theme.TOOLBAR_BG};
  scrollbar-width: thin;
`;

const Tabs = styled.div`
  display: flex;
  min-width: 0;
`;

const Tab = styled.div<{ $active: boolean }>`
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  min-width: 110px;
  max-width: 210px;
  height: 36px;
  padding: 0 8px 0 12px;
  border: 0;
  border-right: 1px solid ${({ theme }) => theme.BACKGROUND_MODIFIER_ACCENT};
  border-bottom: 2px solid ${({ $active, theme }) => ($active ? theme.BLURPLE : "transparent")};
  color: ${({ $active, theme }) => ($active ? theme.INTERACTIVE_ACTIVE : theme.INTERACTIVE_NORMAL)};
  background: ${({ $active, theme }) => ($active ? theme.BACKGROUND_PRIMARY : "transparent")};
  cursor: pointer;
`;

const Name = styled.span`
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
  font-size: 12px;
`;

const Dirty = styled.span`
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
`;

const Close = styled.span`
  display: inline-flex;
  flex: 0 0 auto;
  padding: 2px;
  border-radius: 3px;

  &:hover {
    background: ${({ theme }) => theme.BACKGROUND_MODIFIER_ACCENT};
  }
`;

const Add = styled.button`
  position: sticky;
  right: 0;
  display: grid;
  flex: 0 0 36px;
  place-items: center;
  height: 36px;
  border: 0;
  border-right: 1px solid ${({ theme }) => theme.BACKGROUND_MODIFIER_ACCENT};
  color: ${({ theme }) => theme.INTERACTIVE_NORMAL};
  background: ${({ theme }) => theme.TOOLBAR_BG};
  cursor: pointer;

  &:hover {
    color: ${({ theme }) => theme.INTERACTIVE_HOVER};
    background: ${({ theme }) => theme.BACKGROUND_MODIFIER_ACCENT};
  }
`;

const RenameInput = styled.input`
  min-width: 0;
  width: 100%;
  padding: 2px 4px;
  border: 1px solid ${({ theme }) => theme.BLURPLE};
  border-radius: 3px;
  outline: none;
  color: ${({ theme }) => theme.INTERACTIVE_ACTIVE};
  background: ${({ theme }) => theme.BACKGROUND_PRIMARY};
  font: inherit;
  font-size: 12px;
`;

export const TabBar = () => {
  const tabs = useFile(state => state.tabs);
  const activeTabId = useFile(state => state.activeTabId);
  const createTab = useFile(state => state.createTab);
  const selectTab = useFile(state => state.selectTab);
  const closeTab = useFile(state => state.closeTab);
  const renameTab = useFile(state => state.renameTab);
  const [editingId, setEditingId] = React.useState<string | null>(null);
  const [draftName, setDraftName] = React.useState("");
  const activeRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    activeRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest", inline: "nearest" });
  }, [activeTabId]);

  const finishRename = (commit: boolean) => {
    if (commit && editingId) renameTab(editingId, draftName);
    setEditingId(null);
  };

  const handleClose = (event: React.SyntheticEvent, id: string, hasChanges: boolean) => {
    event.stopPropagation();
    if (
      hasChanges &&
      !window.confirm("This tab has unsaved changes. Are you sure you want to close it?")
    )
      return;
    closeTab(id);
  };

  return (
    <Bar aria-label="Open documents">
      <Tabs role="tablist">
        {tabs.map(tab => {
          const active = tab.id === activeTabId;
          return (
            <Tab
              key={tab.id}
              ref={active ? activeRef : undefined}
              $active={active}
              role="tab"
              tabIndex={active ? 0 : -1}
              aria-selected={active}
              title={tab.name}
              onClick={() => selectTab(tab.id)}
              onKeyDown={event => {
                if (event.key === "Enter" || event.key === " ") selectTab(tab.id);
              }}
              onDoubleClick={() => {
                setEditingId(tab.id);
                setDraftName(tab.name);
              }}
            >
              {editingId === tab.id ? (
                <RenameInput
                  autoFocus
                  value={draftName}
                  aria-label="Document name"
                  onClick={event => event.stopPropagation()}
                  onChange={event => setDraftName(event.target.value)}
                  onBlur={() => finishRename(true)}
                  onKeyDown={event => {
                    if (event.key === "Enter") finishRename(true);
                    if (event.key === "Escape") finishRename(false);
                  }}
                />
              ) : (
                <Name>{tab.name}</Name>
              )}
              {tab.hasChanges && <Dirty aria-label="Unsaved changes" />}
              <Close
                role="button"
                tabIndex={0}
                aria-label={`Close ${tab.name}`}
                onClick={event => handleClose(event, tab.id, tab.hasChanges)}
                onKeyDown={event => {
                  if (event.key === "Enter" || event.key === " ")
                    handleClose(event, tab.id, tab.hasChanges);
                }}
              >
                <VscClose size={14} />
              </Close>
            </Tab>
          );
        })}
      </Tabs>
      <Add type="button" title="New document" aria-label="New document" onClick={() => createTab()}>
        <VscAdd size={16} />
      </Add>
    </Bar>
  );
};
