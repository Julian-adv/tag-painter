# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Toon Maker is a SvelteKit-based web application that interfaces with ComfyUI for AI image generation. The application allows users to create character art by providing prompts across different categories (quality, character, outfit, pose, background) and generates images using a local ComfyUI instance.

## Development Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Type checking
npm run check

# Watch mode type checking
npm run check:watch

# Lint and format code
npm run lint
npm run format
```

## Architecture

### Core Components

The application follows a modular component architecture located in `src/lib/`:

- **ImageGenerator.svelte**: Main orchestrating component that integrates all child components with 1:3 grid layout
- **PromptForm.svelte**: Manages all prompt input forms and model settings (checkpoints, upscale, face detailer)
- **ImageViewer.svelte**: Handles image display, navigation controls, and metadata loading with automatic prompt restoration
- **GenerationControls.svelte**: Contains generation button, progress tracking, and settings dialog
- **TextAreaInput.svelte**: Reusable input component with autocomplete suggestions, select dropdown, textarea, and integrated category controls (drag handle, delete button)
- **SettingsDialog.svelte**: Modal for configuring generation parameters
- **CategoryManagerDialog.svelte**: Dialog for adding and managing new prompt categories
- **OptionsEditDialog.svelte**: Unified dialog for editing category options and settings with drag & drop support
- **AutoCompleteTextarea.svelte**: Enhanced textarea component with auto-completion from tag database
- **ComboBox.svelte**: Filtering and selection component for category management

### Utility Modules

Located in `src/lib/utils/` and `src/lib/stores/`:

- **imageGeneration.ts**: Extracted image generation logic and ComfyUI workflow management
- **comfyui.ts**: WebSocket communication and API interaction utilities
- **fileIO.ts**: File system operations for saving/loading prompts and images
- **types.ts**: Centralized TypeScript type definitions with category alias support
- **workflow.ts**: ComfyUI workflow configuration constants and node definitions
- **date.ts**: Date and time formatting utilities for timestamps
- **constants.ts**: Application-wide constants and default values

### Store Modules

- **stores/promptsStore.ts**: Central Svelte store for prompts data management and persistence
- **stores/tagsStore.ts**: Shared store for auto-completion tags and filtering

### API Routes

- **`/api/prompts`**: Handles saving and loading prompt data to/from `data/prompts.json`
- **`/api/settings`**: Handles saving and loading user settings to/from `data/settings.json`
- **`/api/image`**: Serves generated images from the output directory
- **`/api/image-list`**: Returns list of generated images in the output directory
- **`/api/tags`**: Provides autocomplete tags for prompt suggestions

### ComfyUI Integration

The application connects to a local ComfyUI instance at `http://127.0.0.1:8188` and uses:
- REST API for submitting workflows and fetching available checkpoints
- WebSocket connection for real-time progress updates and image delivery
- Dynamic workflow configuration based on user settings (upscale, face detailer, checkpoint selection)
- Automatic node injection for SaveImageWebsocket based on selected options

### Data Management

- **Prompt Storage**: User inputs are saved to `data/prompts.json` with historical values for each category and category alias support
- **Image Storage**: Generated images are saved to `data/output/` with timestamp-based filenames
- **Metadata Storage**: PNG images include embedded metadata with categorized prompts for automatic restoration using PNG chunk manipulation
- **Quality Templates**: Pre-defined quality prompts stored in `data/qualityValues.json`
- **Tag Database**: Comprehensive tag suggestions from `data/danbooru_tags.txt` (20,000+ tags)
- **State Management**: Uses Svelte 5's `$state`, stores, and callback patterns to avoid prop mutation warnings
- **Settings Persistence**: User preferences saved to `data/settings.json` with validation

### UI/UX Features

- **Responsive Layout**: 1:3 grid ratio with form section and image section
- **Image Navigation**: Previous/next buttons with current position indicator (n / total)
- **Enhanced Autocomplete**: Tag suggestions with keyboard navigation, filtering, and fixed positioning to prevent clipping
- **Progress Tracking**: Real-time progress bar with optimized animation timing
- **Prompt History**: Automatic saving of new prompts to dropdown options on generation
- **Metadata Restoration**: Clicking through saved images automatically loads their generation prompts (toggleable)
- **Drag-and-Drop Reordering**: Categories can be reordered by dragging with visual feedback
- **Scrollable Form Sections**: Form sections with custom thin scrollbars and auto-growing textareas
- **Visual Category Feedback**: Background styling distinguishes random vs non-random categories and shows excluded categories
- **Category Management**: Add, edit, delete, and create aliases for categories with unified dialog interface
- **Options Editing**: Comprehensive options management with drag & drop, autocomplete integration, and editable titles

### Key Features

- **Multi-category prompt system** with dynamic category management and alias support
- **2-Pass Prompt Generation** with category exclusion using `-[category]` pattern  
- **Real-time progress tracking** during image generation with WebSocket communication
- **Dynamic checkpoint selection** from ComfyUI with automatic detection
- **Optional upscaling and face detailing** with configurable settings
- **Automatic image saving** with embedded PNG metadata for prompt restoration
- **Comprehensive tag autocomplete** with 20,000+ Danbooru tags and filtering
- **Advanced category management**: add, edit, delete, create aliases, and reorder categories
- **Enhanced options editing** with unified dialog, drag & drop, and autocomplete integration
- **Visual feedback system** for category states (random, non-random, excluded)
- **Prompt history management** with automatic updates and persistence
- **Image navigation** with position tracking and metadata loading control
- **Settings persistence** with validation and user preference management
- **Auto-growing textareas** that resize based on content with integrated controls

## Component Communication

- Uses callback patterns instead of prop binding to avoid Svelte 5 warnings
- Parent-child communication through well-defined interfaces
- Component instance binding for exposing utility functions (e.g., `refreshFileList`)
- Event-driven updates for real-time progress and image delivery
- **Svelte stores integration** for shared state management (prompts, tags)
- **Cross-component data flow** through centralized stores and reactive patterns

## Important Notes

- The application requires a running ComfyUI instance with specific nodes (SaveImageWebsocket, FaceDetailer, etc.)
- The workflow structure dynamically configures nodes based on user settings
- WebSocket communication tracks the `final_save_output` node for image delivery
- All generated images are automatically saved with timestamp-based filenames and embedded PNG metadata
- **PNG metadata handling** uses chunk manipulation libraries for prompt restoration and categorization
- **Category alias system** allows categories to reference other categories for flexible prompt organization
- **2-pass generation** processes prompts twice: first for category resolution, then for final generation with exclusions
- Component architecture follows separation of concerns with focused, reusable components
- Uses modern Svelte 5 patterns with `$state`, `$props`, `$effect`, and centralized stores
- **TailwindCSS 4.x** is used for styling with custom component classes
- **To avoid lint errors, don't use explicit `any` type** - use proper TypeScript types, `unknown`, or type assertions instead
- **Avoid optional parameters in `$props` types when possible** - prefer required props with default values or explicit handling over optional (`?`) parameters
- **Avoid optional function parameters when possible** - when adding parameters to existing functions, prefer making them required and updating all call sites rather than using optional (`?`) parameters
- **Always run type checking after completing tasks** - execute `npm run check` after finishing any task to ensure there are no TypeScript errors