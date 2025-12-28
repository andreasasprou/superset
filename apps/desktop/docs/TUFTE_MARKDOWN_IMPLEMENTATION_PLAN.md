# Tufte-Style Markdown Viewer Implementation Plan

> **Status**: Ready for implementation  
> **Created**: December 27, 2025  
> **Author**: Architecture review with AI assistance  
> **Estimated Effort**: 3-5 days

## Table of Contents

1. [Overview](#overview)
2. [Design Decisions](#design-decisions)
3. [Architecture](#architecture)
4. [Implementation Phases](#implementation-phases)
5. [Phase 1: Core Markdown Renderer](#phase-1-core-markdown-renderer)
6. [Phase 2: Changes View Integration](#phase-2-changes-view-integration)
7. [Phase 3: Settings UI](#phase-3-settings-ui)
8. [Phase 4: Tufte CSS & Fonts](#phase-4-tufte-css--fonts)
9. [Phase 5: Terminal File Preview (Future)](#phase-5-terminal-file-preview-future)
10. [Testing Checklist](#testing-checklist)
11. [Future Enhancements](#future-enhancements)
12. [Reference Links](#reference-links)

---

## Overview

### What We're Building

A beautiful markdown rendering feature with two style options:
- **Default**: Clean prose typography (similar to GitHub's markdown rendering)
- **Tufte**: Elegant serif typography inspired by Edward Tufte's books

### User Experience

1. User opens a `.md` or `.mdx` file in the Changes/Diff view
2. A "View Rendered" toggle button appears in the toolbar
3. Clicking it switches from diff view to rendered markdown
4. User can choose their preferred style (Default/Tufte) in Settings > Appearance

### Screenshots Reference

The feature should look similar to:
- Rendered view with Tufte typography (elegant serif fonts, centered titles)
- Toggle between diff and rendered views
- Style selector dropdown in Appearance settings

---

## Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **View Mode** | Toggle button | Simple UX, matches existing diff view patterns |
| **Initial Scope** | Changes view only | Focused delivery, expand later |
| **Settings Persistence** | Global | User preference applies everywhere |
| **Sidenotes** | Skip for v1 | Complex feature, add in future iteration |
| **Interactivity** | Read-only | Simpler implementation, no edit conflicts |
| **Fonts** | Bundle ET Book | Offline support, consistent rendering |
| **Styles** | Default + Tufte | Two clear options, expandable later |

---

## Architecture

### Component Hierarchy

```
ChangesContent
├── FileHeader (unchanged)
├── DiffToolbar
│   ├── ViewModeToggle (Side-by-side / Inline)
│   ├── [NEW] MarkdownToggle (View Rendered / View Diff) ← only for .md files
│   └── ActionButtons (Stage / Unstage / Discard)
└── ContentArea
    ├── [CONDITIONAL] MarkdownRenderer ← when showRendered && isMarkdownFile
    └── [CONDITIONAL] DiffViewer ← default
```

### State Management

```
┌─────────────────────────────────────────────────────────────────┐
│                     Zustand Stores                               │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  useChangesStore (existing)                                      │
│  ├── viewMode: "side-by-side" | "inline"                        │
│  ├── [NEW] showRenderedMarkdown: Record<string, boolean>        │
│  │         ^ per-worktree preference                            │
│  └── ...other state                                             │
│                                                                  │
│  useMarkdownPreferencesStore (NEW)                              │
│  └── style: "default" | "tufte"                                 │
│      ^ global preference, persisted                             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### File Structure

```
apps/desktop/src/renderer/
├── components/
│   └── MarkdownRenderer/                    # NEW DIRECTORY
│       ├── MarkdownRenderer.tsx             # Main component
│       ├── index.ts                         # Barrel export
│       ├── styles/
│       │   ├── default.css                  # Default prose styles
│       │   └── tufte.css                    # Tufte typography
│       └── components/
│           ├── CodeBlock/
│           │   ├── CodeBlock.tsx            # Syntax highlighted code
│           │   └── index.ts
│           └── index.ts
├── stores/
│   ├── index.ts                             # MODIFY: add export
│   └── markdown-preferences/                # NEW DIRECTORY
│       ├── store.ts                         # Zustand store
│       └── index.ts
├── assets/
│   └── fonts/
│       └── et-book/                         # NEW DIRECTORY
│           ├── et-book-roman-line-figures.woff2
│           ├── et-book-roman-old-style-figures.woff2
│           ├── et-book-display-italic-old-style-figures.woff2
│           ├── et-book-bold-line-figures.woff2
│           └── et-book-semi-bold-old-style-figures.woff2
└── screens/main/components/
    ├── SettingsView/
    │   └── AppearanceSettings.tsx           # MODIFY: add markdown style
    └── WorkspaceView/ContentView/ChangesContent/
        ├── ChangesContent.tsx               # MODIFY: conditional rendering
        └── components/
            └── DiffToolbar/
                └── DiffToolbar.tsx          # MODIFY: add toggle button
```

---

## Implementation Phases

| Phase | Description | Files | Effort |
|-------|-------------|-------|--------|
| 1 | Core Markdown Renderer | 6 new files | 1 day |
| 2 | Changes View Integration | 3 modified files | 0.5 day |
| 3 | Settings UI | 2 modified files | 0.5 day |
| 4 | Tufte CSS & Fonts | 2 new files, fonts | 1 day |
| 5 | Terminal Preview (future) | TBD | Deferred |

---

## Phase 1: Core Markdown Renderer

### 1.1 Install Dependencies

```bash
cd apps/desktop
bun add react-markdown remark-gfm rehype-raw rehype-sanitize
```

**Package purposes:**
- `react-markdown`: Core markdown-to-React renderer
- `remark-gfm`: GitHub Flavored Markdown (tables, strikethrough, task lists)
- `rehype-raw`: Allow raw HTML in markdown (needed for some advanced features)
- `rehype-sanitize`: Security - sanitize HTML to prevent XSS

### 1.2 Create Markdown Preferences Store

**File: `apps/desktop/src/renderer/stores/markdown-preferences/store.ts`**

```typescript
import { create } from "zustand";
import { devtools, persist } from "zustand/middleware";

export type MarkdownStyle = "default" | "tufte";

interface MarkdownPreferencesState {
  /** Current markdown rendering style */
  style: MarkdownStyle;
  
  /** Set the markdown style */
  setStyle: (style: MarkdownStyle) => void;
}

export const useMarkdownPreferencesStore = create<MarkdownPreferencesState>()(
  devtools(
    persist(
      (set) => ({
        style: "default",
        
        setStyle: (style) => {
          set({ style });
        },
      }),
      {
        name: "markdown-preferences",
      }
    ),
    { name: "MarkdownPreferencesStore" }
  )
);

// Convenience hooks
export const useMarkdownStyle = () => 
  useMarkdownPreferencesStore((state) => state.style);
export const useSetMarkdownStyle = () => 
  useMarkdownPreferencesStore((state) => state.setStyle);
```

**File: `apps/desktop/src/renderer/stores/markdown-preferences/index.ts`**

```typescript
export * from "./store";
```

**Modify: `apps/desktop/src/renderer/stores/index.ts`**

```typescript
// Add this export
export * from "./markdown-preferences";
```

### 1.3 Create CodeBlock Component

**File: `apps/desktop/src/renderer/components/MarkdownRenderer/components/CodeBlock/CodeBlock.tsx`**

```typescript
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import type { ComponentPropsWithoutRef } from "react";

interface CodeBlockProps extends ComponentPropsWithoutRef<"code"> {
  inline?: boolean;
}

export function CodeBlock({ 
  children, 
  className, 
  inline,
  ...props 
}: CodeBlockProps) {
  const match = /language-(\w+)/.exec(className || "");
  const language = match ? match[1] : undefined;
  
  // Inline code
  if (inline || !language) {
    return (
      <code 
        className="px-1.5 py-0.5 rounded bg-muted font-mono text-sm" 
        {...props}
      >
        {children}
      </code>
    );
  }
  
  // Code block with syntax highlighting
  return (
    <SyntaxHighlighter
      style={oneDark}
      language={language}
      PreTag="div"
      className="rounded-md text-sm"
      {...props}
    >
      {String(children).replace(/\n$/, "")}
    </SyntaxHighlighter>
  );
}
```

**File: `apps/desktop/src/renderer/components/MarkdownRenderer/components/CodeBlock/index.ts`**

```typescript
export { CodeBlock } from "./CodeBlock";
```

**File: `apps/desktop/src/renderer/components/MarkdownRenderer/components/index.ts`**

```typescript
export { CodeBlock } from "./CodeBlock";
```

### 1.4 Create Main MarkdownRenderer Component

**File: `apps/desktop/src/renderer/components/MarkdownRenderer/MarkdownRenderer.tsx`**

```typescript
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import rehypeRaw from "rehype-raw";
import rehypeSanitize from "rehype-sanitize";
import { cn } from "@superset/ui/utils";
import { useMarkdownStyle } from "renderer/stores";
import { CodeBlock } from "./components";
import "./styles/default.css";
import "./styles/tufte.css";

interface MarkdownRendererProps {
  /** Markdown content to render */
  content: string;
  /** Optional style override (defaults to global preference) */
  style?: "default" | "tufte";
  /** Additional CSS classes */
  className?: string;
}

export function MarkdownRenderer({ 
  content, 
  style: styleProp,
  className 
}: MarkdownRendererProps) {
  const globalStyle = useMarkdownStyle();
  const style = styleProp ?? globalStyle;
  
  return (
    <div 
      className={cn(
        "markdown-renderer h-full overflow-y-auto",
        style === "tufte" ? "tufte-markdown" : "default-markdown",
        className
      )}
    >
      <article className="px-8 py-6 max-w-none">
        <ReactMarkdown
          remarkPlugins={[remarkGfm]}
          rehypePlugins={[rehypeRaw, rehypeSanitize]}
          components={{
            code: ({ inline, className, children, ...props }) => (
              <CodeBlock 
                inline={inline} 
                className={className} 
                {...props}
              >
                {children}
              </CodeBlock>
            ),
            // Style tables
            table: ({ children }) => (
              <div className="overflow-x-auto my-4">
                <table className="min-w-full divide-y divide-border">
                  {children}
                </table>
              </div>
            ),
            th: ({ children }) => (
              <th className="px-4 py-2 text-left text-sm font-semibold bg-muted">
                {children}
              </th>
            ),
            td: ({ children }) => (
              <td className="px-4 py-2 text-sm border-t border-border">
                {children}
              </td>
            ),
            // Style blockquotes
            blockquote: ({ children }) => (
              <blockquote className="border-l-4 border-muted-foreground/30 pl-4 italic my-4">
                {children}
              </blockquote>
            ),
            // Style links
            a: ({ href, children }) => (
              <a 
                href={href} 
                className="text-primary underline underline-offset-2 hover:text-primary/80"
                target="_blank"
                rel="noopener noreferrer"
              >
                {children}
              </a>
            ),
            // Style images
            img: ({ src, alt }) => (
              <img 
                src={src} 
                alt={alt} 
                className="max-w-full h-auto rounded-md my-4"
              />
            ),
            // Style horizontal rules
            hr: () => (
              <hr className="my-8 border-border" />
            ),
            // Task list items
            li: ({ children, className }) => {
              const isTaskItem = className?.includes("task-list-item");
              return (
                <li className={cn(isTaskItem && "list-none flex items-start gap-2")}>
                  {children}
                </li>
              );
            },
          }}
        >
          {content}
        </ReactMarkdown>
      </article>
    </div>
  );
}
```

**File: `apps/desktop/src/renderer/components/MarkdownRenderer/index.ts`**

```typescript
export { MarkdownRenderer } from "./MarkdownRenderer";
```

### 1.5 Create Default Styles

**File: `apps/desktop/src/renderer/components/MarkdownRenderer/styles/default.css`**

```css
/* Default Markdown Styles - Clean prose typography */

.default-markdown {
  color: var(--foreground);
  background: var(--background);
}

.default-markdown article {
  max-width: 65ch;
  margin: 0 auto;
}

/* Typography */
.default-markdown h1 {
  font-size: 2.25rem;
  font-weight: 700;
  line-height: 1.2;
  margin-top: 0;
  margin-bottom: 1rem;
  letter-spacing: -0.025em;
}

.default-markdown h2 {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.3;
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border);
}

.default-markdown h3 {
  font-size: 1.25rem;
  font-weight: 600;
  line-height: 1.4;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
}

.default-markdown h4,
.default-markdown h5,
.default-markdown h6 {
  font-size: 1rem;
  font-weight: 600;
  line-height: 1.5;
  margin-top: 1.25rem;
  margin-bottom: 0.5rem;
}

.default-markdown p {
  margin-top: 0;
  margin-bottom: 1rem;
  line-height: 1.7;
}

.default-markdown ul,
.default-markdown ol {
  margin-top: 0;
  margin-bottom: 1rem;
  padding-left: 1.5rem;
}

.default-markdown li {
  margin-bottom: 0.25rem;
  line-height: 1.6;
}

.default-markdown ul {
  list-style-type: disc;
}

.default-markdown ol {
  list-style-type: decimal;
}

.default-markdown li > ul,
.default-markdown li > ol {
  margin-top: 0.25rem;
  margin-bottom: 0;
}

/* Code */
.default-markdown pre {
  margin: 1rem 0;
  border-radius: 0.375rem;
  overflow-x: auto;
}

/* Strong and emphasis */
.default-markdown strong {
  font-weight: 600;
}

.default-markdown em {
  font-style: italic;
}

/* Strikethrough (GFM) */
.default-markdown del {
  text-decoration: line-through;
  opacity: 0.7;
}
```

### 1.6 Create Tufte Styles (Placeholder)

**File: `apps/desktop/src/renderer/components/MarkdownRenderer/styles/tufte.css`**

```css
/* Tufte Markdown Styles - Placeholder for Phase 4 */
/* Full implementation will be added with ET Book fonts */

.tufte-markdown {
  color: var(--foreground);
  background: var(--background);
}

.tufte-markdown article {
  max-width: 55%;
  padding-left: 12.5%;
}

/* Typography - will use ET Book when fonts are added */
.tufte-markdown h1 {
  font-size: 2.5rem;
  font-weight: 400;
  line-height: 1.2;
  margin-top: 4rem;
  margin-bottom: 1.5rem;
  font-style: italic;
}

.tufte-markdown h2 {
  font-size: 1.5rem;
  font-weight: 400;
  line-height: 1.3;
  margin-top: 2rem;
  margin-bottom: 0.75rem;
  font-style: italic;
}

.tufte-markdown h3 {
  font-size: 1.25rem;
  font-weight: 400;
  line-height: 1.4;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  font-style: italic;
}

.tufte-markdown p {
  margin-top: 0;
  margin-bottom: 1.4rem;
  line-height: 1.6;
  font-size: 1.0625rem; /* 17px - Tufte's preferred size */
}

/* Tufte-style blockquotes (epigraphs) */
.tufte-markdown blockquote {
  margin: 2rem 0;
  padding: 0;
  border: none;
  font-style: italic;
}

.tufte-markdown blockquote footer,
.tufte-markdown blockquote cite {
  display: block;
  margin-top: 0.5rem;
  font-style: normal;
  font-size: 0.875rem;
}

/* Lists */
.tufte-markdown ul,
.tufte-markdown ol {
  margin-top: 0;
  margin-bottom: 1.4rem;
  padding-left: 1.5rem;
}

.tufte-markdown li {
  margin-bottom: 0.35rem;
  line-height: 1.6;
}
```

---

## Phase 2: Changes View Integration

### 2.1 Modify Changes Store

**Modify: `apps/desktop/src/renderer/stores/changes/store.ts`**

Add the following to the existing store:

```typescript
// Add to interface ChangesState:
interface ChangesState {
  // ... existing properties
  
  /** Whether to show rendered markdown instead of diff (per worktree) */
  showRenderedMarkdown: Record<string, boolean>;
  
  // ... existing actions
  
  /** Toggle rendered markdown view for a worktree */
  toggleRenderedMarkdown: (worktreePath: string) => void;
  
  /** Get rendered markdown state for a worktree */
  getShowRenderedMarkdown: (worktreePath: string) => boolean;
}

// Add to initialState:
const initialState = {
  // ... existing
  showRenderedMarkdown: {} as Record<string, boolean>,
};

// Add to store implementation:
toggleRenderedMarkdown: (worktreePath) => {
  const { showRenderedMarkdown } = get();
  set({
    showRenderedMarkdown: {
      ...showRenderedMarkdown,
      [worktreePath]: !showRenderedMarkdown[worktreePath],
    },
  });
},

getShowRenderedMarkdown: (worktreePath) => {
  return get().showRenderedMarkdown[worktreePath] ?? false;
},

// Add to partialize for persistence:
partialize: (state) => ({
  // ... existing
  showRenderedMarkdown: state.showRenderedMarkdown,
}),
```

### 2.2 Modify DiffToolbar

**Modify: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/ChangesContent/components/DiffToolbar/DiffToolbar.tsx`**

```typescript
// Add imports
import { HiMiniDocumentText, HiMiniCodeBracket } from "react-icons/hi2";

// Update interface
interface DiffToolbarProps {
  viewMode: DiffViewMode;
  onViewModeChange: (mode: DiffViewMode) => void;
  category: ChangeCategory;
  onStage?: () => void;
  onUnstage?: () => void;
  onDiscard?: () => void;
  isActioning?: boolean;
  isEditable?: boolean;
  isSaving?: boolean;
  // NEW props
  isMarkdownFile?: boolean;
  showRendered?: boolean;
  onToggleRendered?: () => void;
}

// Add to component, after the existing ToggleGroup:
{isMarkdownFile && (
  <Button
    variant="outline"
    size="sm"
    onClick={onToggleRendered}
    className="gap-1.5"
  >
    {showRendered ? (
      <>
        <HiMiniCodeBracket className="w-4 h-4" />
        View Diff
      </>
    ) : (
      <>
        <HiMiniDocumentText className="w-4 h-4" />
        View Rendered
      </>
    )}
  </Button>
)}
```

### 2.3 Modify ChangesContent

**Modify: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/ChangesContent/ChangesContent.tsx`**

```typescript
// Add imports
import { MarkdownRenderer } from "renderer/components/MarkdownRenderer";
import { useChangesStore } from "renderer/stores/changes";

// Inside component, add:
const { 
  viewMode, 
  setViewMode, 
  baseBranch, 
  getSelectedFile, 
  selectFile,
  // NEW
  getShowRenderedMarkdown,
  toggleRenderedMarkdown,
} = useChangesStore();

// Add helper to detect markdown files
const isMarkdownFile = selectedFile?.path.match(/\.(md|mdx)$/i) !== null;
const showRendered = worktreePath ? getShowRenderedMarkdown(worktreePath) : false;

const handleToggleRendered = () => {
  if (worktreePath) {
    toggleRenderedMarkdown(worktreePath);
  }
};

// Update DiffToolbar props:
<DiffToolbar
  viewMode={viewMode}
  onViewModeChange={setViewMode}
  category={selectedCategory}
  onStage={isUnstaged ? stage : undefined}
  onUnstage={isStaged ? unstage : undefined}
  onDiscard={isUnstaged ? handleDiscard : undefined}
  isActioning={isPending}
  isEditable={isEditable}
  isSaving={saveFileMutation.isPending}
  // NEW props
  isMarkdownFile={isMarkdownFile}
  showRendered={showRendered}
  onToggleRendered={handleToggleRendered}
/>

// Update content rendering (replace the DiffViewer section):
<div className="flex-1 overflow-hidden">
  {isMarkdownFile && showRendered ? (
    <MarkdownRenderer content={contents.modified} />
  ) : (
    <DiffViewer
      contents={contents}
      viewMode={viewMode}
      filePath={selectedFile.path}
      editable={isEditable}
      onSave={handleSave}
    />
  )}
</div>
```

---

## Phase 3: Settings UI

### 3.1 Modify AppearanceSettings

**Modify: `apps/desktop/src/renderer/screens/main/components/SettingsView/AppearanceSettings.tsx`**

```typescript
// Add imports
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@superset/ui/select";
import { 
  useMarkdownStyle, 
  useSetMarkdownStyle,
  type MarkdownStyle 
} from "renderer/stores";

// Inside component, add:
const markdownStyle = useMarkdownStyle();
const setMarkdownStyle = useSetMarkdownStyle();

// Add after the Theme Section (before "Custom Themes" section):
{/* Markdown Style Section */}
<div className="pt-6 border-t">
  <h3 className="text-sm font-medium mb-2">Markdown Style</h3>
  <p className="text-sm text-muted-foreground mb-4">
    Rendering style for markdown files when viewing rendered content
  </p>
  <Select 
    value={markdownStyle} 
    onValueChange={(value) => setMarkdownStyle(value as MarkdownStyle)}
  >
    <SelectTrigger className="w-[200px]">
      <SelectValue />
    </SelectTrigger>
    <SelectContent>
      <SelectItem value="default">Default</SelectItem>
      <SelectItem value="tufte">Tufte</SelectItem>
    </SelectContent>
  </Select>
  <p className="text-xs text-muted-foreground mt-2">
    Tufte style uses elegant serif typography inspired by Edward Tufte's books
  </p>
</div>
```

---

## Phase 4: Tufte CSS & Fonts

### 4.1 Download ET Book Fonts

1. Clone the Tufte CSS repository:
   ```bash
   git clone https://github.com/edwardtufte/tufte-css.git /tmp/tufte-css
   ```

2. Copy font files:
   ```bash
   mkdir -p apps/desktop/src/renderer/assets/fonts/et-book
   cp -r /tmp/tufte-css/et-book/* apps/desktop/src/renderer/assets/fonts/et-book/
   ```

3. Clean up:
   ```bash
   rm -rf /tmp/tufte-css
   ```

**Expected font files:**
- `et-book-roman-line-figures.woff` / `.woff2`
- `et-book-roman-old-style-figures.woff` / `.woff2`
- `et-book-display-italic-old-style-figures.woff` / `.woff2`
- `et-book-bold-line-figures.woff` / `.woff2`
- `et-book-semi-bold-old-style-figures.woff` / `.woff2`

### 4.2 Update Tufte CSS with Fonts

**Replace: `apps/desktop/src/renderer/components/MarkdownRenderer/styles/tufte.css`**

```css
/* Tufte Markdown Styles - Full implementation with ET Book fonts */

/* Font Face Declarations */
@font-face {
  font-family: "et-book";
  src: url("../../../assets/fonts/et-book/et-book-roman-line-figures.woff2") format("woff2"),
       url("../../../assets/fonts/et-book/et-book-roman-line-figures.woff") format("woff");
  font-weight: normal;
  font-style: normal;
  font-display: swap;
}

@font-face {
  font-family: "et-book";
  src: url("../../../assets/fonts/et-book/et-book-display-italic-old-style-figures.woff2") format("woff2"),
       url("../../../assets/fonts/et-book/et-book-display-italic-old-style-figures.woff") format("woff");
  font-weight: normal;
  font-style: italic;
  font-display: swap;
}

@font-face {
  font-family: "et-book";
  src: url("../../../assets/fonts/et-book/et-book-bold-line-figures.woff2") format("woff2"),
       url("../../../assets/fonts/et-book/et-book-bold-line-figures.woff") format("woff");
  font-weight: bold;
  font-style: normal;
  font-display: swap;
}

/* Base Tufte Styles */
.tufte-markdown {
  font-family: et-book, Palatino, "Palatino Linotype", "Palatino LT STD", 
               "Book Antiqua", Georgia, serif;
  color: var(--foreground);
  background: var(--background);
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.tufte-markdown article {
  width: 55%;
  padding-left: 12.5%;
  padding-right: 12.5%;
}

/* Responsive: full width on smaller screens */
@media (max-width: 1200px) {
  .tufte-markdown article {
    width: 80%;
    padding-left: 10%;
    padding-right: 10%;
  }
}

@media (max-width: 760px) {
  .tufte-markdown article {
    width: 90%;
    padding-left: 5%;
    padding-right: 5%;
  }
}

/* Typography */
.tufte-markdown h1 {
  font-size: 2.5rem;
  font-weight: 400;
  line-height: 1.08;
  margin-top: 4rem;
  margin-bottom: 1.5rem;
}

.tufte-markdown h2 {
  font-size: 1.5rem;
  font-weight: 400;
  font-style: italic;
  line-height: 1.3;
  margin-top: 2.1rem;
  margin-bottom: 0;
}

.tufte-markdown h3 {
  font-size: 1.25rem;
  font-weight: 400;
  font-style: italic;
  line-height: 1.4;
  margin-top: 2rem;
  margin-bottom: 0;
}

.tufte-markdown h4,
.tufte-markdown h5,
.tufte-markdown h6 {
  font-size: 1.1rem;
  font-weight: 400;
  font-style: italic;
  line-height: 1.5;
  margin-top: 1.5rem;
  margin-bottom: 0;
}

.tufte-markdown p {
  font-size: 1.0625rem; /* 17px */
  line-height: 1.6;
  margin-top: 1.4rem;
  margin-bottom: 0;
  padding-right: 0;
}

.tufte-markdown p:first-child {
  margin-top: 0;
}

/* Newthought - small caps for opening phrases */
.tufte-markdown .newthought {
  font-variant: small-caps;
  font-size: 1.1em;
  letter-spacing: 0.05em;
}

/* Blockquotes / Epigraphs */
.tufte-markdown blockquote {
  font-style: italic;
  margin: 2rem 0;
  padding: 0;
  border: none;
}

.tufte-markdown blockquote footer,
.tufte-markdown blockquote cite {
  display: block;
  font-style: normal;
  font-size: 0.875rem;
  margin-top: 0.5rem;
}

.tufte-markdown blockquote footer::before,
.tufte-markdown blockquote cite::before {
  content: "— ";
}

/* Lists */
.tufte-markdown ul,
.tufte-markdown ol {
  font-size: 1.0625rem;
  line-height: 1.6;
  margin-top: 1.4rem;
  margin-bottom: 0;
  padding-left: 2rem;
}

.tufte-markdown li {
  margin-bottom: 0.35rem;
}

/* Links */
.tufte-markdown a {
  color: inherit;
  text-decoration: underline;
  text-decoration-color: var(--muted-foreground);
  text-underline-offset: 2px;
}

.tufte-markdown a:hover {
  text-decoration-color: var(--foreground);
}

/* Code */
.tufte-markdown code {
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, 
               "Liberation Mono", monospace;
  font-size: 0.875em;
}

.tufte-markdown pre {
  margin: 1.4rem 0;
  overflow-x: auto;
}

/* Tables */
.tufte-markdown table {
  border-collapse: collapse;
  font-size: 0.9375rem;
  margin: 1.4rem 0;
  width: auto;
}

.tufte-markdown th {
  border-bottom: 1px solid var(--border);
  font-weight: 400;
  padding: 0.5rem 1rem 0.5rem 0;
  text-align: left;
}

.tufte-markdown td {
  border-bottom: 1px solid var(--border);
  padding: 0.5rem 1rem 0.5rem 0;
}

/* Horizontal Rules */
.tufte-markdown hr {
  border: none;
  border-top: 1px solid var(--border);
  margin: 2rem 0;
}

/* Images */
.tufte-markdown img {
  max-width: 100%;
  height: auto;
}

/* Strong and Emphasis */
.tufte-markdown strong {
  font-weight: bold;
}

.tufte-markdown em {
  font-style: italic;
}

/* Strikethrough */
.tufte-markdown del {
  text-decoration: line-through;
}
```

---

## Phase 5: Terminal File Preview (Future)

> **Note**: This phase is deferred. Document for future implementation.

### Concept

When users click file paths in terminal output, provide an option to preview in-app instead of opening in external editor.

### Implementation Outline

1. **Modify Terminal Link Provider**
   - File: `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/Terminal/helpers.ts`
   - Add "Preview in Superset" option to context menu

2. **Create File Preview Panel**
   - New component to display file content
   - Route to appropriate viewer based on file type
   - Markdown files use `MarkdownRenderer`

3. **Tab System Integration**
   - Open preview in new tab or split view
   - Tab management for multiple previews

### Estimated Effort: 2-3 days (when prioritized)

---

## Testing Checklist

### Phase 1: Core Renderer
- [ ] Dependencies install without errors
- [ ] MarkdownRenderer renders basic markdown (headings, paragraphs, lists)
- [ ] Code blocks have syntax highlighting
- [ ] Tables render correctly
- [ ] GFM features work (task lists, strikethrough, autolinks)
- [ ] Links open in external browser
- [ ] Images display correctly

### Phase 2: Changes Integration
- [ ] Toggle button only appears for `.md` and `.mdx` files
- [ ] Toggle button doesn't appear for other file types
- [ ] Clicking toggle switches between diff and rendered view
- [ ] Toggle state persists per worktree
- [ ] Rendered view shows the "modified" content (current file state)

### Phase 3: Settings
- [ ] Markdown Style dropdown appears in Appearance settings
- [ ] Selecting "Default" applies default styles
- [ ] Selecting "Tufte" applies Tufte styles
- [ ] Preference persists across app restarts

### Phase 4: Tufte Styles
- [ ] ET Book fonts load correctly
- [ ] Tufte style has correct typography (serif, italic headings)
- [ ] Responsive layout works (narrows on smaller windows)
- [ ] No font loading errors in console

### Visual QA
- [ ] Default style looks clean and professional
- [ ] Tufte style matches reference (elegant, book-like)
- [ ] Both styles respect app theme (light/dark mode)
- [ ] No visual glitches or layout issues

---

## Future Enhancements

### Sidenotes (v2)
- Convert markdown footnotes `[^1]` to margin sidenotes
- Requires custom remark plugin
- Reference: [noghartt/blog remarkPluginSidenotes.ts](https://github.com/noghartt/blog/blob/main/plugins/remarkPluginSidenotes.ts)

### Additional Styles
- **GitHub**: Match GitHub's markdown rendering exactly
- **Academic**: Optimized for papers and documentation
- **Minimal**: Ultra-clean, distraction-free

### Export Options
- Export rendered markdown as PDF
- Export as HTML

### Enhanced Code Blocks
- Copy button
- Line numbers
- Line highlighting
- Diff highlighting within code blocks

### Math Support
- LaTeX rendering with KaTeX or MathJax
- Requires `remark-math` and `rehype-katex`

### Mermaid Diagrams
- Render mermaid code blocks as diagrams
- Requires `remark-mermaid` or custom component

---

## Reference Links

### Libraries
- [react-markdown](https://github.com/remarkjs/react-markdown) - Core renderer
- [remark-gfm](https://github.com/remarkjs/remark-gfm) - GitHub Flavored Markdown
- [Tufte CSS](https://github.com/edwardtufte/tufte-css) - Typography reference
- [ET Book fonts](https://github.com/edwardtufte/et-book) - Font files

### Existing Codebase References
- `DiffViewer.tsx` - Pattern for content viewer component
- `DiffToolbar.tsx` - Pattern for toolbar with toggles
- `AppearanceSettings.tsx` - Pattern for settings UI
- `useThemeStore` - Pattern for persisted preferences store
- `useChangesStore` - Store to extend for markdown toggle state

### Design References
- [Tufte CSS Demo](https://edwardtufte.github.io/tufte-css/)
- [Tufte Handout PDF](http://rmarkdown.rstudio.com/examples/tufte-handout.pdf)

---

## Questions for Product/Design

1. Should the default style exactly match GitHub's rendering, or have its own personality?
2. Should we show a preview of the style in the settings dropdown?
3. For the toggle button, prefer icon-only or icon+text?
4. Should we add keyboard shortcut for toggle (e.g., Cmd+Shift+M)?

---

*End of Implementation Plan*
