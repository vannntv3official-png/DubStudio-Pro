import React, { useState } from 'react';
import { Film, Plus } from 'lucide-react';
import { useProjectStore } from '@/stores/projectStore';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Select } from '@/components/ui/Select';

interface NewProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const NewProjectModal: React.FC<NewProjectModalProps> = ({ isOpen, onClose }) => {
  const { createProject, isLoading } = useProjectStore();

  const [name, setName] = useState('New Dubbing Project');
  const [sourceLang, setSourceLang] = useState('auto');
  const [targetLang, setTargetLang] = useState('km');
  const [syncMode, setSyncMode] = useState('balanced');

  const handleCreate = async () => {
    if (!name.trim()) return;
    try {
      await createProject(name.trim(), sourceLang, targetLang, syncMode);
      onClose();
    } catch (e: any) {
      alert(`Failed to create project: ${e.message}`);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Create New DubStudio Pro Project" maxWidth="md">
      <div className="flex flex-col gap-4 text-xs">
        <Input
          label="Project Name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Khmer Dubbed Documentary"
        />

        <div className="grid grid-cols-2 gap-3">
          <Select
            label="Original Video Language"
            options={[
              { value: 'auto', label: 'Auto Detect (ស្វ័យប្រវត្តិ)' },
              { value: 'zh', label: 'Chinese (ភាសាចិន)' },
              { value: 'en', label: 'English (អង់គ្លេស)' },
              { value: 'km', label: 'Khmer (ខ្មែរ)' },
              { value: 'ko', label: 'Korean (កូរ៉េ)' },
              { value: 'ja', label: 'Japanese (ជប៉ុន)' },
              { value: 'vi', label: 'Vietnamese (វៀតណាម)' },
              { value: 'fr', label: 'French (បារាំង)' },
              { value: 'es', label: 'Spanish (អេស្ប៉ាញ)' },
            ]}
            value={sourceLang}
            onChange={(e) => setSourceLang(e.target.value)}
          />

          <Select
            label="Target Dubbing Language"
            options={[
              { value: 'km', label: 'Khmer (ភាសាខ្មែរ - Default)' },
              { value: 'en', label: 'English' },
              { value: 'vi', label: 'Vietnamese (Tiếng Việt)' },
              { value: 'zh', label: 'Chinese (中文)' },
              { value: 'ja', label: 'Japanese (日本語)' },
              { value: 'fr', label: 'French (Français)' },
              { value: 'es', label: 'Spanish (Español)' },
            ]}
            value={targetLang}
            onChange={(e) => setTargetLang(e.target.value)}
          />
        </div>

        <Select
          label="Audio Synchronization Strategy"
          options={[
            { value: 'balanced', label: 'Balanced (High Natural Quality + Accurate Timing)' },
            { value: 'natural', label: 'Natural (Preserve Untouched Speaking Cadence)' },
            { value: 'strict', label: 'Strict Sync (Lock Exactly to Segment Length)' },
          ]}
          value={syncMode}
          onChange={(e) => setSyncMode(e.target.value)}
        />

        <div className="flex justify-end gap-2 pt-2 border-t border-studio-border mt-2">
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={handleCreate} isLoading={isLoading}>
            <Plus className="w-4 h-4" />
            <span>Create Project</span>
          </Button>
        </div>
      </div>
    </Modal>
  );
};
