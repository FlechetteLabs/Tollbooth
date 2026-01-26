import React, { useState, useEffect } from 'react';
import { Annotation, AnnotationTargetType } from '../../types';
import { TagInput } from './TagInput';

interface AnnotationPanelProps {
  targetType: AnnotationTargetType;
  targetId: string;
  className?: string;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export const AnnotationPanel: React.FC<AnnotationPanelProps> = ({
  targetType,
  targetId,
  className = '',
  collapsible = true,
  defaultCollapsed = true,
}) => {
  const [annotation, setAnnotation] = useState<Annotation | null>(null);
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [allTags, setAllTags] = useState<string[]>([]);

  // Form state
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [tags, setTags] = useState<string[]>([]);

  // Fetch annotation for target
  useEffect(() => {
    const fetchAnnotation = async () => {
      setIsLoading(true);
      try {
        const res = await fetch(`${API_BASE}/api/annotations/target/${targetType}/${targetId}`);
        if (res.ok) {
          const data = await res.json();
          setAnnotation(data);
          setTitle(data.title);
          setBody(data.body || '');
          setTags(data.tags || []);
        } else if (res.status === 404) {
          setAnnotation(null);
          setTitle('');
          setBody('');
          setTags([]);
        }
      } catch (err) {
        console.error('Failed to fetch annotation:', err);
      } finally {
        setIsLoading(false);
      }
    };

    fetchAnnotation();
  }, [targetType, targetId]);

  // Fetch all tags for autocomplete
  useEffect(() => {
    const fetchTags = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/annotations/tags`);
        if (res.ok) {
          const data = await res.json();
          setAllTags(data.tags || []);
        }
      } catch (err) {
        console.error('Failed to fetch tags:', err);
      }
    };
    fetchTags();
  }, []);

  const handleSave = async () => {
    if (!title.trim()) {
      return;
    }

    setIsSaving(true);
    try {
      if (annotation) {
        // Update existing
        const res = await fetch(`${API_BASE}/api/annotations/${annotation.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, body, tags }),
        });
        if (res.ok) {
          const data = await res.json();
          setAnnotation(data.annotation);
          setIsEditing(false);
        }
      } else {
        // Create new
        const res = await fetch(`${API_BASE}/api/annotations`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            target_type: targetType,
            target_id: targetId,
            title,
            body,
            tags,
          }),
        });
        if (res.ok) {
          const data = await res.json();
          setAnnotation(data.annotation);
          setIsEditing(false);
        }
      }
    } catch (err) {
      console.error('Failed to save annotation:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!annotation) return;

    if (!confirm('Delete this annotation?')) return;

    try {
      const res = await fetch(`${API_BASE}/api/annotations/${annotation.id}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        setAnnotation(null);
        setTitle('');
        setBody('');
        setTags([]);
        setIsEditing(false);
      }
    } catch (err) {
      console.error('Failed to delete annotation:', err);
    }
  };

  const handleCancel = () => {
    if (annotation) {
      setTitle(annotation.title);
      setBody(annotation.body || '');
      setTags(annotation.tags || []);
    } else {
      setTitle('');
      setBody('');
      setTags([]);
    }
    setIsEditing(false);
  };

  // Format hierarchical tag for display
  const formatTag = (tag: string) => {
    const parts = tag.split(':');
    if (parts.length > 1) {
      return parts.join(' \u203A ');
    }
    return tag;
  };

  if (isLoading) {
    return (
      <div className={`bg-gray-800 rounded p-3 ${className}`}>
        <div className="text-gray-400 text-sm">Loading annotation...</div>
      </div>
    );
  }

  const header = (
    <div
      className={`flex items-center justify-between ${collapsible ? 'cursor-pointer' : ''}`}
      onClick={() => collapsible && setIsCollapsed(!isCollapsed)}
    >
      <div className="flex items-center gap-2">
        {collapsible && (
          <span className="text-gray-400">{isCollapsed ? '\u25B6' : '\u25BC'}</span>
        )}
        <span className="text-sm font-medium text-gray-300">
          {annotation ? 'Annotation' : 'Add Annotation'}
        </span>
        {annotation && !isCollapsed && annotation.tags.length > 0 && (
          <div className="flex gap-1 ml-2">
            {annotation.tags.slice(0, 3).map((tag, i) => (
              <span key={i} className="px-1.5 py-0.5 bg-blue-600/20 text-blue-400 rounded text-xs">
                {formatTag(tag)}
              </span>
            ))}
            {annotation.tags.length > 3 && (
              <span className="text-gray-500 text-xs">+{annotation.tags.length - 3}</span>
            )}
          </div>
        )}
      </div>
      {!isCollapsed && annotation && !isEditing && (
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button
            onClick={() => setIsEditing(true)}
            className="text-xs text-blue-400 hover:text-blue-300"
          >
            Edit
          </button>
          <button
            onClick={handleDelete}
            className="text-xs text-red-400 hover:text-red-300"
          >
            Delete
          </button>
        </div>
      )}
    </div>
  );

  if (isCollapsed) {
    return (
      <div className={`bg-gray-800 rounded p-3 ${className}`}>
        {header}
        {annotation && (
          <div className="mt-1 text-sm text-gray-400 truncate">{annotation.title}</div>
        )}
      </div>
    );
  }

  return (
    <div className={`bg-gray-800 rounded p-3 ${className}`}>
      {header}

      <div className="mt-3 space-y-3">
        {isEditing || !annotation ? (
          <>
            {/* Title input */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Title</label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Brief description..."
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500"
              />
            </div>

            {/* Body textarea */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Details (optional)</label>
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Additional notes..."
                rows={3}
                className="w-full px-3 py-2 bg-gray-900 border border-gray-700 rounded text-sm text-gray-200 focus:outline-none focus:border-blue-500 resize-none"
              />
            </div>

            {/* Tags */}
            <div>
              <label className="block text-xs text-gray-400 mb-1">Tags</label>
              <TagInput
                tags={tags}
                onChange={setTags}
                suggestions={allTags}
                placeholder="Add tags (e.g., refusal:soft)"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end">
              {(annotation || title || body || tags.length > 0) && (
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 text-sm text-gray-400 hover:text-gray-200"
                >
                  Cancel
                </button>
              )}
              <button
                onClick={handleSave}
                disabled={!title.trim() || isSaving}
                className="px-3 py-1.5 bg-blue-600 text-white rounded text-sm hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isSaving ? 'Saving...' : annotation ? 'Update' : 'Save'}
              </button>
            </div>
          </>
        ) : (
          <>
            {/* Display mode */}
            <div>
              <div className="text-sm font-medium text-gray-200">{annotation.title}</div>
              {annotation.body && (
                <div className="mt-2 text-sm text-gray-400 whitespace-pre-wrap">
                  {annotation.body}
                </div>
              )}
            </div>

            {annotation.tags.length > 0 && (
              <div className="flex flex-wrap gap-1">
                {annotation.tags.map((tag, i) => (
                  <span
                    key={i}
                    className="px-2 py-0.5 bg-blue-600/20 text-blue-400 rounded text-xs"
                  >
                    {formatTag(tag)}
                  </span>
                ))}
              </div>
            )}

            <div className="text-xs text-gray-500">
              Updated {new Date(annotation.updated_at).toLocaleString()}
            </div>
          </>
        )}
      </div>
    </div>
  );
};
