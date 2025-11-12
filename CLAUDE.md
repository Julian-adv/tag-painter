# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Tag Painter is a SvelteKit-based web application that interfaces with ComfyUI for AI image generation. The application allows users to create character art by providing tags across different zones, with advanced features including:

- **LLM-Assisted Prompt Generation**: Integrated Gemini chat interface for generating prompts via conversation
- **Character Management**: Full character card support with CHARX-JPEG format for embedding character data
- **Multi-Model Support**: SDXL, Qwen, Qwen Nunchaku, Chroma, and Flux1 Krea models
- **Advanced Wildcard System**: YAML-based hierarchical prompt organization with visual tree editor
- **Automated Installation**: Guided installation wizard for ComfyUI, models, and dependencies
- **Mask-Based Inpainting**: Interactive canvas drawing for precise image editing

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

The application follows a modular component architecture with components organized in `src/lib/`:

#### ImageGenerator Module (`src/lib/ImageGenerator/`)

Main orchestration module for image generation workflow:

- **ImageGenerator.svelte**: Core component integrating all generation features, chat interface, and workflow management
- **TagZones.svelte**: Container for managing tag input zones with ChipEditor integration
- **CompositionSelector.svelte**: Interface for selecting image composition layouts with visual previews
- **ModelControls.svelte**: Model selection and configuration controls
- **PostProcessingControls.svelte**: Post-processing options (refine/face detail modes)
- **TabNavigation.svelte**: Tab navigation between different sections

#### Chat & Character Components (`src/lib/Chat/`)

LLM integration and character management:

- **ChatInterface.svelte**: Gemini LLM chat interface for prompt generation with character context support
- **CharacterManagerDialog.svelte**: Character card management with CRUD operations and CHARX-JPEG support

#### Download & Installation (`src/lib/downloads/`)

Guided installation system with step-based wizard:

- **InstallWizardDialog.svelte**: Main wizard container with step controller
- **EssentialDownloadsStep.svelte**: Essential files download step
- **ComfyInstallStep.svelte**: ComfyUI installation
- **CustomNodesInstallStep.svelte**: Custom ComfyUI nodes installation
- **ModelDownloadsStep.svelte**: Model downloads
- **NunchakuInstallStep.svelte**: Nunchaku framework installation
- **DownloadFilesStep.svelte**: Generic file download handler
- **DownloadGroupStep.svelte**: Group-based download management with progress tracking
- **StartComfyStep.svelte**: ComfyUI startup

#### Tag Management Components

- **TagInput.svelte**: Individual tag zone input component with quick tag entry and autocomplete
- **TagDisplay.svelte**: Component for displaying tags as removable boxes with delete functionality
- **TagItem.svelte**: Individual tag box component with styling and delete functionality
- **AutoCompleteTextarea.svelte**: Enhanced textarea component with auto-completion from tag database
- **CategoryManagerDialog.svelte**: Dialog for managing tag categories and options

#### Image Viewing & Drawing

- **ImageViewer.svelte**: Image display, navigation controls, metadata display, and mask drawing integration
- **DrawingControls.svelte**: Mask drawing tool controls with radio-style tool selection
- **DrawingCanvas.svelte**: Canvas component for interactive mask drawing with brush and flood fill tools
- **PngInfoPanel.svelte**: Displays PNG metadata from generated images

#### Generation Controls

- **GenerationControls.svelte**: Generation button, progress tracking, and settings access
- **SettingsDialog.svelte**: Comprehensive modal for configuring generation parameters with per-model overrides

#### Model Selection Components

- **LoraSelector.svelte**: Component for selecting and configuring LoRA models with weight adjustment
- **LoraItem.svelte**: Individual LoRA item display component
- **LoraSelectionModal.svelte**: Modal for browsing and selecting LoRA models
- **SamplerSelector.svelte**: Dropdown selector for sampling methods
- **SchedulerSelector.svelte**: Dropdown selector for scheduler algorithms

#### UI Utilities

- **ComboBox.svelte**: Filtering and selection component with dropdown
- **CustomSelect.svelte**: Custom select component
- **WheelAdjustableInput.svelte**: Numeric input with mouse wheel adjustment support
- **ActionButton.svelte**: Reusable button component with consistent styling
- **Toasts.svelte**: Toast notification system for messages and errors

### Utility Modules

Located in `src/lib/utils/`:

#### Generation Utilities (`src/lib/generation/`)

- **imageGeneration.ts**: Main generation entry point and router with Qwen-specific workflow handling
- **generationCommon.ts**: Shared utilities for both SD and Qwen generation paths (UUID generation, model settings resolution)
- **comfyui.ts**: WebSocket communication and API interaction utilities
- **comfyErrorParser.ts**: ComfyUI error parsing and handling
- **workflowBuilder.ts**: Main workflow submission for prompts
- **universalWorkflowBuilder.ts**: Universal workflow building
- **qwenWorkflowBuilder.ts**: Qwen-specific workflow configuration
- **workflowMapping.ts**: Node mapping and configuration
- **workflow.ts**: ComfyUI workflow constants and node definitions for Stable Diffusion
- **qwenNunchakuLora.ts**: Nunchaku LoRA attachment for Qwen models

#### File & Data Operations

- **fileIO.ts**: File system operations for saving/loading prompts and images
- **pngMetadata.ts**: PNG metadata extraction and embedding using chunk manipulation
- **loraPath.ts**: LoRA path resolution utilities

#### Tag & Wildcard Processing

- **tagExpansion.ts**: Advanced tag expansion with wildcard support, random selection, and directive processing
- **wildcards.ts**: Wildcard file handling and path resolution
- **wildcardZones.ts**: Zone-based wildcard data reading and writing
- **compositionDetection.ts**: Auto-detection of composition from tags (e.g., composition=all)
- **tagStyling.ts**: Tag styling and highlighting utilities
- **textFormatting.ts**: Text formatting and manipulation utilities

#### General Utilities

- **date.ts**: Date and time formatting utilities for timestamps
- **random.ts**: Random number generation utilities
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

#### Image Management

- **`/api/image`**: Serves generated images from the output directory
- **`/api/image-list`**: Returns list of generated images in the output directory

#### Tag & Prompt Management

- **`/api/tags`**: Provides autocomplete tags for prompt suggestions from Danbooru tag database
- **`/api/prompts`**: Handles saving and loading tag zone data to/from `data/prompts.json`
- **`/api/wildcards`**: Handles reading and writing wildcard YAML files (model-type specific)
- **`/api/wildcard-file`**: Serves individual wildcard files by name

#### Settings & Configuration

- **`/api/settings`**: Handles saving and loading user settings to/from `data/settings.json`

#### LoRA & Models

- **`/api/loras`**: Handles LoRA model information and selection from ComfyUI

#### Mask & Inpainting

- **`/api/mask`**: Handles saving of user-drawn mask data to temporary file
- **`/api/mask-path`**: Provides composition mask file paths (handles temp-mask special case)

#### Character Management

- **`/api/characters`**: List all character cards
- **`/api/characters/create`**: Create new character card
- **`/api/characters/update`**: Update existing character card
- **`/api/characters/delete`**: Delete character card
- **`/api/characters/order`**: Reorder character cards

#### Chat & LLM

- **`/api/chat-history`**: Save and load chat conversation history

#### ComfyUI Integration

- **`/api/comfy/status`**: Check ComfyUI status
- **`/api/comfy/start`**: Start ComfyUI instance
- **`/api/comfy/install`**: Install ComfyUI
- **`/api/comfy/install-nunchaku`**: Install Nunchaku framework

#### Download Management

- **`/api/downloads`**: Stream-based download handler for files/archives/git repos
- **`/api/downloads-check`**: Check for missing required files

#### Workflow & Utilities

- **`/api/workflow`**: Custom workflow handling
- **`/api/open-folder`**: Opens output folder in system file explorer (Windows/Linux/Mac)
- **`/api/platform`**: Platform detection (OS information)
- **`/api/logs`**: Logging endpoints

### ComfyUI Integration

The application connects to a local ComfyUI instance at `http://127.0.0.1:8188` and uses:

- **REST API**: Submitting workflows and fetching available checkpoints, VAEs, and LoRAs
- **WebSocket Connection**: Real-time progress updates and image delivery
- **Dynamic Workflow Configuration**: Based on user settings (upscale, face detailer, checkpoint selection)
- **Automatic Node Injection**: SaveImageWebsocket based on selected options
- **Multi-Model Support**: SDXL, Qwen, Qwen Nunchaku, Chroma, Flux1 Krea workflows
- **Per-Model Settings**: Checkpoints, VAEs, schedulers, quality/negative prefixes, LoRA configurations
- **Inpainting Workflow**: Mask-based image editing with adjustable denoise strength
- **Automated Installation**: Guided installation wizard for ComfyUI, custom nodes, models, and Nunchaku framework
- **Error Handling**: ComfyUI error parsing with user-friendly messages

### Data Management

#### Wildcard & Prompt Storage

- **Wildcard Storage**: User wildcards stored in YAML format at `data/wildcards.yaml` (Stable Diffusion) and `data/wildcards_qwen.yaml` (Qwen models)
- **Zone-based Wildcards**: Wildcards organized by zones (all, zone1, zone2, negative, inpainting) with hierarchical tree structure
- **Tag Expansion**: Advanced wildcard processing with random selection, pinning, disabling, and nested expansion
- **Prompts Persistence**: Tag zone data saved to `data/prompts.json` (legacy, now uses wildcards.yaml)

#### Image & Mask Storage

- **Image Storage**: Generated images are saved to `data/output/` with timestamp-based filenames
- **Mask Storage**: User-drawn masks stored as `static/temp_mask.png` for web accessibility and reuse
- **Metadata Storage**: PNG images include embedded metadata with expanded prompts and settings for restoration using PNG chunk manipulation

#### Character & Chat Data

- **Character Cards**: Character data stored in `data/characters/` with `.character.json` format
- **CHARX-JPEG Support**: Binary format for embedding character cards in JPEG images with ZIP payload
- **Chat History**: Conversation history stored in `data/chat-history/` per model
- **System Prompts**: Model-specific system prompts in `data/system-prompt/`

#### Configuration & Database

- **Tag Database**: Comprehensive tag suggestions from `data/danbooru_tags.txt` (20,000+ tags)
- **Settings Persistence**: User preferences saved to `data/settings.json` with per-model overrides and validation
- **State Management**: Uses Svelte 5's `$state`, stores, and callback patterns to avoid prop mutation warnings

### UI/UX Features

#### Layout & Navigation

- **Responsive Layout**: Grid layout with tag zones section and image section
- **Tab Navigation**: Organized tabs for different sections and features
- **Image Navigation**: Previous/next buttons with current position indicator (n / total)
- **Scrollable Sections**: Tag zones with custom thin scrollbars for overflow handling

#### Tag & Prompt Management

- **Tag Zone Management**: Separate input zones for All tags, First Zone, Second Zone, and Negative Tags with ChipEditor
- **Tag Display**: Tags shown as removable boxes with individual delete functionality
- **Quick Tag Entry**: Autocomplete-enabled quick input for adding tags to zones
- **Enhanced Autocomplete**: Tag suggestions with keyboard navigation, filtering, and fixed positioning to prevent clipping
- **Visual Tree Editor**: TreeEdit interface for managing hierarchical wildcard structures with drag & drop

#### LLM Chat Integration

- **Chat Interface**: Gemini LLM integration for conversational prompt generation
- **Character Context**: Select character cards to provide context for prompt generation
- **Multi-language Support**: English/Chinese prompt generation
- **Chat History**: Persistent conversation history with resend capability

#### Character Management

- **Character Browser**: Browse and select character cards
- **Character Editor**: Create, update, and delete character cards
- **CHARX-JPEG Support**: Import/export character cards embedded in JPEG images
- **Character Ordering**: Reorder character list

#### Image Generation & Viewing

- **Composition Selection**: Visual composition selector with clickable layout previews
- **Model Selection**: Choose from SDXL, Qwen, Qwen Nunchaku, Chroma, Flux1 Krea models
- **LoRA Integration**: Model selector with weight adjustment and visual feedback
- **Progress Tracking**: Real-time progress bar with optimized animation timing
- **Metadata Display**: View PNG metadata with generation parameters
- **Metadata Restoration**: Clicking through saved images automatically loads their generation tags (toggleable)

#### Mask Drawing & Inpainting

- **Interactive Mask Drawing**: Canvas-based drawing with brush and flood fill tools, custom cursors, and visual feedback
- **Modular Drawing Components**: Separated drawing controls and canvas logic for better maintainability
- **Black Background**: Optimized for inpainting visibility

#### Installation & Downloads

- **Installation Wizard**: Step-by-step guided installation for ComfyUI and dependencies
- **Progress Tracking**: Real-time download progress with file/archive/git support
- **Missing Files Detection**: Automatic detection and guided download of required files

#### General UX

- **Toast Notifications**: User-friendly messages and error notifications
- **Persistent Storage**: Automatic saving of tag zones and settings with instant updates
- **Keyboard Shortcuts**: Enhanced navigation and editing in tree editor
- **Mouse Wheel Adjustment**: Numeric inputs with scroll-to-adjust

### Key Features

#### LLM & Character Integration

- **Gemini LLM Integration**: Conversational prompt generation with Gemini 2.5 Pro
- **Character Card Support**: Full character.json specification with multi-language support
- **CHARX-JPEG Format**: Embed character cards in JPEG images with ZIP payload
- **Character Management**: Create, update, delete, and reorder character cards
- **Chat History**: Persistent conversation history with context awareness

#### Prompt & Wildcard System

- **Advanced Wildcard System**: YAML-based hierarchical tree structure for organizing prompts
- **TreeEdit Interface**: Visual tree editor for managing wildcard hierarchies (arrays, objects, leaves)
- **Zone-based Organization**: Separate wildcard zones (All, Zone1, Zone2, Negative, Inpainting)
- **Intelligent Tag Expansion**: Random selection from arrays, consistent randomization, pinning, disabling directives, and inline options `{a|b|c}`
- **Composition Auto-detection**: Automatically selects layout from tags (e.g., `composition=all`, `composition=2h`)
- **Comprehensive Tag Autocomplete**: 20,000+ Danbooru tags with similarity-based filtering

#### Multi-Model Support

- **5 Model Types**: SDXL, Qwen, Qwen Nunchaku, Chroma, Flux1 Krea with separate workflows
- **Per-Model Settings**: Checkpoint-specific overrides for samplers, schedulers, VAEs, and prompt prefixes
- **Dynamic Checkpoint Selection**: Automatic detection from ComfyUI
- **LoRA Integration**: Model selector with weight adjustment and visual selection interface
- **Nunchaku Framework**: Specialized support for Qwen Nunchaku LoRA

#### Image Generation & Processing

- **Visual Composition Selection**: Clickable layout previews for image generation
- **Real-time Progress Tracking**: WebSocket communication for generation progress
- **Optional Upscaling**: Configurable per-model upscaling with refine modes
- **Face Detailing**: Face enhancement with per-model settings
- **Inpainting Support**: Mask drawing, image-to-image workflow, adjustable denoise strength
- **Automatic Metadata Embedding**: PNG metadata with expanded prompts and settings
- **Metadata Restoration**: Load generation settings from saved images

#### Installation & Setup

- **Automated Installation Wizard**: Step-by-step guided installation for ComfyUI and dependencies
- **ComfyUI Auto-Install**: Download and install ComfyUI Portable automatically
- **Custom Nodes Installation**: Install required ComfyUI nodes
- **Model Downloads**: Guided download for checkpoints, VAEs, and LoRAs
- **Nunchaku Installation**: Automated Nunchaku framework setup
- **Missing Files Detection**: Check and download required files

#### Drawing & Editing

- **Interactive Mask Drawing**: Canvas-based drawing with brush and flood fill tools
- **Custom Cursors**: Visual feedback for drawing tools
- **Black Background**: Optimized for inpainting visibility
- **Modular Architecture**: Separated drawing controls and canvas logic

#### Data & Storage

- **Persistent Wildcard Storage**: Automatic saving and loading of YAML trees
- **Image Navigation**: Position tracking and metadata loading control
- **Character Data Storage**: Organized character card files
- **Chat History Persistence**: Per-model conversation history
- **Cross-platform Support**: Windows/Linux/Mac folder opening and file handling

## Component Communication

- **Two-way Data Binding**: Uses `bind:` syntax for clean component communication (preferred over callbacks)
- **Parent-Child Interfaces**: Well-defined interfaces with `$bindable()` tags for prop binding
- **Component Instance Binding**: Exposing utility functions (e.g., `refreshFileList`)
- **Event-driven Updates**: Real-time progress and image delivery via events
- **Svelte Stores Integration**: Centralized state management for tag zones, settings, test mode, and mask overlay
- **Cross-component Data Flow**: Reactive patterns through stores and state sharing
- **Tag Zone Synchronization**: Between TagZones, TagInput, and TagDisplay components
- **Modular Architecture**: Separated concerns (e.g., DrawingControls and DrawingCanvas, ImageGenerator module structure)
- **Step-based Wizard Pattern**: InstallWizard uses StepInterface for modular installation flow

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
