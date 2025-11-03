# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Tag Painter is a SvelteKit-based web application that interfaces with ComfyUI for AI image generation. The application allows users to create character art by providing tags across different zones (All, First Zone, Second Zone, Negative Tags) and generates images using a local ComfyUI instance.

## Development Commands

```bash
# Start development server
npm run dev

# Build for release
npm run release

# Preview production build
npm run preview

# Type checking
npm run check

# Watch mode type checking
npm run check:watch

# Lint and format code
npm run lint
npm run format

# Testing
npm test            # Run tests in watch mode
npm run test:run    # Run tests once
npm run test:ui     # Run tests with UI interface
```

## Architecture

### Core Components

The application follows a modular component architecture located in `src/lib/`:

- **ImageGenerator.svelte**: Main orchestrating component that integrates all child components with grid layout
- **CompositionSelector.svelte**: Interface for selecting image composition layouts with visual previews
- **TagZones.svelte**: Container component for managing different tag input zones with persistent storage
- **TagInput.svelte**: Individual tag zone input component with quick tag entry and autocomplete
- **TagDisplay.svelte**: Component for displaying tags as removable boxes with delete functionality
- **TagItem.svelte**: Individual tag box component with styling and delete functionality
- **TagManageDialog.svelte**: Dialog for managing tag collections and categories
- **ImageViewer.svelte**: Handles image display, navigation controls, and integrates mask drawing components
- **DrawingControls.svelte**: Dedicated component for mask drawing controls with radio-style tool selection
- **DrawingCanvas.svelte**: Canvas component for interactive mask drawing with brush and flood fill tools
- **GenerationControls.svelte**: Contains generation button, progress tracking, and settings dialog
- **LoraSelector.svelte**: Component for selecting and configuring LoRA models with weight adjustment
- **LoraItem.svelte**: Individual LoRA item display component
- **LoraSelectionModal.svelte**: Modal for browsing and selecting LoRA models
- **SettingsDialog.svelte**: Modal for configuring generation parameters
- **SamplerSelector.svelte**: Dropdown selector for sampling methods
- **SchedulerSelector.svelte**: Dropdown selector for scheduler algorithms
- **CategoryManagerDialog.svelte**: Dialog for managing tag categories and options
- **AutoCompleteTextarea.svelte**: Enhanced textarea component with auto-completion from tag database
- **ComboBox.svelte**: Filtering and selection component with dropdown
- **WheelAdjustableInput.svelte**: Numeric input with mouse wheel adjustment support
- **ActionButton.svelte**: Reusable button component with consistent styling
- **DownloadsDialog.svelte**: Dialog for managing required downloads when assets are missing

### Utility Modules

Located in `src/lib/utils/`:

- **imageGeneration.ts**: Main image generation logic and ComfyUI workflow management for Stable Diffusion models
- **qwenImageGeneration.ts**: Qwen-specific image generation logic with specialized workflow handling
- **generationCommon.ts**: Shared utilities for both SD and Qwen generation paths
- **comfyui.ts**: WebSocket communication and API interaction utilities
- **fileIO.ts**: File system operations for saving/loading prompts and images
- **workflow.ts**: ComfyUI workflow configuration constants and node definitions for Stable Diffusion
- **qwenWorkflow.ts**: ComfyUI workflow configuration for Qwen models
- **tagExpansion.ts**: Advanced tag expansion with wildcard support, random selection, and directive processing
- **wildcards.ts**: Wildcard file handling and path resolution
- **wildcardZones.ts**: Zone-based wildcard data reading and writing
- **compositionDetection.ts**: Auto-detection of composition from tags (e.g., composition=all)
- **date.ts**: Date and time formatting utilities for timestamps
- **tagStyling.ts**: Tag styling and highlighting utilities
- **textFormatting.ts**: Text formatting and manipulation utilities
- **stringSimilarity.ts**: String similarity calculation for autocomplete
- **treeBuilder.ts**: Tree model construction for hierarchical data
- **treeSearch.ts**: Tree model search and traversal utilities

### Store Modules

Located in `src/lib/stores/`:

- **promptsStore.ts**: Central Svelte store for tag zones data management and persistence
- **tagsStore.ts**: Shared store for wildcard tree model, auto-completion tags, and tag filtering
- **testModeStore.svelte.ts**: Svelte 5 runes-based store for testing mode state management
- **maskOverlayStore.ts**: Store for mask overlay visibility state

### TreeEdit Module

Located in `src/lib/TreeEdit/`:

Visual tree editor for managing hierarchical wildcard structures:

**Components:**

- **TreeEdit.svelte**: Main tree editor component with keyboard navigation and drag & drop support
- **TreeNode.svelte**: Individual tree node renderer for arrays, objects, and leaf values
- **TreeEditControlPanel.svelte**: Control panel with add/delete/expand buttons and filtering
- **TreeFilter.svelte**: Filter input for searching tree nodes by name or value
- **TreeNodePath.svelte**: Breadcrumb-style path display for current node location
- **InlineEditor.svelte**: Inline editing component for node names and values
- **PlaceholderChipDisplay.svelte**: Display component for placeholder chips in text
- **DisablesEditor.svelte**: Editor for managing tag disable directives
- **WildcardsEditorDialog.svelte**: Full-screen dialog for editing wildcard trees

**Utilities:**

- **model.ts**: Core tree model types and data structures (TreeModel, AnyNode, array/object/leaf nodes)
- **operations.ts**: Tree manipulation operations (add, delete, move, rename, set value)
- **selection.ts**: Selection state management for tree nodes
- **nav.ts**: Keyboard navigation logic for tree traversal
- **dnd.ts**: Drag-and-drop operations for reordering nodes
- **treeKeyboard.ts**: Keyboard shortcut handling for tree operations
- **yaml-io.ts**: YAML import/export for tree models (toYAML, fromYAML)
- **utils.ts**: Helper functions for tree operations and validation
- **addBySelection.ts**: Smart node addition based on current selection

### API Routes

Located in `src/routes/api/`:

- **`/api/prompts`**: Handles saving and loading tag zone data to/from `data/prompts.json`
- **`/api/settings`**: Handles saving and loading user settings to/from `data/settings.json`
- **`/api/image`**: Serves generated images from the output directory
- **`/api/image-list`**: Returns list of generated images in the output directory
- **`/api/tags`**: Provides autocomplete tags for prompt suggestions from Danbooru tag database
- **`/api/loras`**: Handles LoRA model information and selection from ComfyUI
- **`/api/mask-path`**: Provides composition mask file paths (handles temp-mask special case)
- **`/api/mask`**: Handles saving of user-drawn mask data to temporary file
- **`/api/wildcards`**: Handles reading and writing wildcard YAML files (model-type specific)
- **`/api/wildcard-file`**: Serves individual wildcard files by name
- **`/api/open-folder`**: Opens output folder in system file explorer (Windows/Linux/Mac)

### ComfyUI Integration

The application connects to a local ComfyUI instance at `http://127.0.0.1:8188` and uses:

- REST API for submitting workflows and fetching available checkpoints, VAEs, and LoRAs
- WebSocket connection for real-time progress updates and image delivery
- Dynamic workflow configuration based on user settings (upscale, face detailer, checkpoint selection)
- Automatic node injection for SaveImageWebsocket based on selected options
- Dual workflow support: Stable Diffusion (with regional prompting) and Qwen models
- Per-model settings and overrides (checkpoints, VAEs, schedulers, quality/negative prefixes)
- Inpainting workflow with mask-based image editing

### Data Management

- **Wildcard Storage**: User wildcards stored in YAML format at `data/wildcards.yaml` (Stable Diffusion) and `data/wildcards_qwen.yaml` (Qwen models)
- **Zone-based Wildcards**: Wildcards organized by zones (all, zone1, zone2, negative, inpainting) with hierarchical tree structure
- **Tag Expansion**: Advanced wildcard processing with random selection, pinning, disabling, and nested expansion
- **Image Storage**: Generated images are saved to `data/output/` with timestamp-based filenames
- **Mask Storage**: User-drawn masks stored as `static/temp_mask.png` for web accessibility and reuse
- **Metadata Storage**: PNG images include embedded metadata with expanded prompts and settings for restoration
- **Tag Database**: Comprehensive tag suggestions from `data/danbooru_tags.txt` (20,000+ tags)
- **State Management**: Uses Svelte 5's `$state`, stores, and callback patterns to avoid prop mutation warnings
- **Settings Persistence**: User preferences saved to `data/settings.json` with per-model overrides and validation
- **Prompts Persistence**: Tag zone data saved to `data/prompts.json` (legacy, now uses wildcards.yaml)

### UI/UX Features

- **Responsive Layout**: Grid layout with tag zones section and image section
- **Composition Selection**: Visual composition selector with clickable layout previews
- **Tag Zone Management**: Separate input zones for All tags, First Zone, Second Zone, and Negative Tags
- **Tag Display**: Tags shown as removable boxes with individual delete functionality
- **Quick Tag Entry**: Autocomplete-enabled quick input for adding tags to zones
- **Image Navigation**: Previous/next buttons with current position indicator (n / total)
- **Enhanced Autocomplete**: Tag suggestions with keyboard navigation, filtering, and fixed positioning to prevent clipping
- **Progress Tracking**: Real-time progress bar with optimized animation timing
- **Metadata Restoration**: Clicking through saved images automatically loads their generation tags (toggleable)
- **Scrollable Sections**: Tag zones with custom thin scrollbars for overflow handling
- **LoRA Integration**: Model selector with weight adjustment and visual feedback
- **Persistent Storage**: Automatic saving of tag zones and settings with instant updates
- **Interactive Mask Drawing**: Canvas-based drawing with brush and flood fill tools, custom cursors, and visual feedback
- **Modular Drawing Components**: Separated drawing controls and canvas logic for better maintainability

### Key Features

- **Advanced Wildcard System** with YAML-based hierarchical tree structure for organizing prompts
- **TreeEdit Interface** with visual tree editor for managing wildcard hierarchies (arrays, objects, leaves)
- **Zone-based Organization** with separate wildcard zones (All, Zone1, Zone2, Negative, Inpainting)
- **Intelligent Tag Expansion** with random selection from arrays, consistent randomization, pinning, disabling directives, and inline options `{a|b|c}`
- **Composition Auto-detection** automatically selects layout from tags (e.g., `composition=all`, `composition=2h`)
- **Dual Model Support** with separate workflows for Stable Diffusion and Qwen image models
- **Visual composition selection** with clickable layout previews for image generation
- **Real-time progress tracking** during image generation with WebSocket communication
- **Dynamic checkpoint selection** from ComfyUI with automatic detection
- **LoRA model integration** with weight adjustment and visual selection interface
- **Per-model Settings** with checkpoint-specific overrides for samplers, schedulers, VAEs, and prompt prefixes
- **Optional upscaling and face detailing** with configurable per-model settings
- **Inpainting Support** with mask drawing, image-to-image workflow, and adjustable denoise strength
- **Automatic image saving** with embedded PNG metadata including expanded prompts and settings
- **Comprehensive tag autocomplete** with 20,000+ Danbooru tags and similarity-based filtering
- **Persistent wildcard storage** with automatic saving and loading of YAML trees
- **Image navigation** with position tracking and metadata loading control
- **Custom scrollbars** for improved UI aesthetics
- **Interactive mask drawing** with brush and flood fill tools, custom cursors, and black background for inpainting
- **Cross-platform folder opening** for Windows/Linux/Mac output directory access

## Component Communication

- Uses `bind:` syntax for clean two-way data binding between components (preferred over callbacks)
- Parent-child communication through well-defined interfaces with `$bindable()` tags
- Component instance binding for exposing utility functions (e.g., `refreshFileList`)
- Event-driven updates for real-time progress and image delivery
- **Svelte stores integration** for shared state management (tag zones, settings)
- **Cross-component data flow** through centralized stores and reactive patterns
- **Tag zone synchronization** between TagZones, TagInput, and TagDisplay components
- **Modular drawing architecture** with separated DrawingControls and DrawingCanvas components for better maintainability

## Important Notes

- The application requires a running ComfyUI instance with specific nodes (SaveImageWebsocket, FaceDetailer, etc.)
- The workflow structure dynamically configures nodes based on user settings
- WebSocket communication tracks the `final_save_output` node for image delivery
- All generated images are automatically saved with timestamp-based filenames and embedded PNG metadata
- **PNG metadata handling** uses chunk manipulation libraries (png-chunks-extract, png-chunks-encode, png-chunk-text) for storing expanded prompts and settings
- **Wildcard system** organizes prompts into hierarchical YAML trees with zone-based structure (all, zone1, zone2, negative, inpainting)
- **TreeEdit interface** provides visual editing of wildcard trees with drag & drop, keyboard shortcuts, and filtering
- **Tag expansion** supports advanced directives: `@random`, `@pin`, `@disable`, `disables=[tag1, tag2]`, wildcards (`__filename__`), and placeholder syntax (`{option1|option2}`)
- **Composition auto-detection** from tags (composition=all, composition=2h, composition=2v) with automatic UI updates
- **Dual model support** with separate workflows and settings for Stable Diffusion and Qwen models
- **Composition selection** allows users to choose image layouts with visual previews, including custom temp-mask
- **Interactive mask drawing** uses black background for better inpainting compatibility and stores single reusable mask file
- Component architecture follows separation of concerns with focused, reusable components
- Uses modern Svelte 5 patterns with `$state`, `$props`, `$bindable`, and centralized stores
- **TailwindCSS** is used for styling with custom component classes and thin scrollbars
- **To avoid lint errors, don't use explicit `any` type** - use proper TypeScript types, `unknown`, or type assertions instead
- **Avoid optional parameters in `$props` types when possible** - prefer required props with default values or explicit handling over optional (`?`) parameters
- **Avoid optional function parameters when possible** - when adding parameters to existing functions, prefer making them required and updating all call sites rather than using optional (`?`) parameters
- **Always run type checking after completing tasks** - execute `npm run check` after finishing any task to ensure there are no TypeScript errors
- **Run tests before committing** - execute `npm run test:run` to ensure all tests pass before making commits

## Testing Framework

### Setup and Configuration

The application uses **Vitest** as the testing framework with the following setup:

- **Test Runner**: Vitest with JSDOM environment for DOM testing
- **Testing Library**: `@testing-library/svelte` for component testing with `@testing-library/jest-dom` matchers
- **Configuration**: Test configuration is in `vite.config.ts` with setup file at `src/setupTests.ts`
- **Test Patterns**: Tests are located alongside source files with `.test.ts` or `.spec.ts` extensions

### Test Categories

1. **Unit Tests**: Testing individual utility functions and stores
   - `src/lib/utils/date.test.ts`: Date formatting utilities
   - `src/lib/utils/tagExpansion.test.ts`: Tag expansion core logic with wildcards and directives
   - `src/lib/utils/tagExpansion.pins.test.ts`: Tag expansion pinning behavior
   - `src/lib/utils/tagExpansion.disables.test.ts`: Tag expansion disable directives
   - `src/lib/utils/tagStyling.test.ts`: Tag styling utilities
   - `src/lib/utils/textFormatting.test.ts`: Text formatting utilities
   - `src/lib/utils/compositionDetection.test.ts`: Composition auto-detection from tags
   - `src/lib/utils/treeBuilder.test.ts`: Tree model construction
   - `src/lib/utils/fileIO.test.ts`: File I/O operations
   - `src/lib/utils/comfyui.test.ts`: ComfyUI API interactions
   - `src/lib/stores/testModeStore.test.ts`: Test mode store functionality
   - `src/lib/stores/promptsStore.test.ts`: Prompts store behavior
   - `src/lib/TreeEdit/utils.test.ts`: TreeEdit utility functions

2. **Component Tests**: Testing Svelte components in isolation
   - `src/lib/TagDisplay.test.ts`: Tag display component functionality
   - `src/lib/ComboBox.test.ts`: Combo box component behavior

### Testing Best Practices

- **Component Testing**: Use `@testing-library/svelte` to test components with realistic user interactions
- **Store Testing**: Test Svelte stores in isolation to ensure proper state management
- **Utility Testing**: Write comprehensive unit tests for utility functions with edge cases
- **Mock External Dependencies**: Mock API calls and external services in tests
- **Test File Organization**: Place test files next to the code they test for better discoverability

### Running Tests

```bash
# Run tests in watch mode (development)
npm test

# Run all tests once (CI/production)
npm run test:run

# Run tests with visual UI interface
npm run test:ui
```

## TODO / Future Features

### Completed Features ✓

- ✓ **Mask-based Inpainting**: Full inpainting workflow with user-drawn masks (completed)
- ✓ **Advanced Wildcard System**: YAML-based hierarchical wildcards with TreeEdit interface (completed)
- ✓ **Tag Expansion Directives**: @random, @pin, @disable, wildcards, placeholders (completed)
- ✓ **Tag Exclusion Rules**: `disables=[xxx, yyy]` syntax to prevent specific tags when selected (completed)
- ✓ **Tag Group Selection**: Array nodes automatically select one child randomly; inline syntax `{a|b|c}` for options (completed)
- ✓ **Composition Auto-detection**: Auto-select composition from tags (completed)
- ✓ **Dual Model Support**: Separate workflows for SD and Qwen (completed)
- ✓ **Per-model Settings**: Checkpoint-specific overrides and prefixes (completed)
- ✓ **ComfyUI Portable Auto-Installation**: Automatic download and installation of ComfyUI environment (completed)

### High Priority

- **Advanced Tag Constraints**: Extended tag relationship management
  - Add tag dependency relationships (tag A requires tag B)
  - Provide enhanced UI for managing complex tag relationships

### Medium Priority

- **Batch Processing**: Generate multiple images with variations
  - Queue multiple generations with different settings
  - Batch apply random tag variations
  - Export batch results with metadata
  - Progress tracking for batch operations

### Low Priority

- **Additional Drawing Tools**: Expand mask creation capabilities
  - Add eraser tool for mask editing
  - Implement selection tools (rectangle, lasso)
  - Add mask blur/feather options
  - Support multiple mask layers

- **Advanced Workflow Support**: Extended ComfyUI integration
  - Support custom workflow loading
  - Dynamic node configuration UI
  - Workflow templates and presets
  - Real-time workflow validation

### Performance & Quality of Life

- **Improved Error Handling**: Better user feedback and recovery
  - Detailed error messages with solutions
  - Automatic retry mechanisms
  - Connection status indicators
  - Offline mode support

- **Enhanced UI/UX**: Better user experience
  - Keyboard shortcuts for common actions
  - Drag & drop file support
  - Theme customization options
  - Mobile responsive design improvements
