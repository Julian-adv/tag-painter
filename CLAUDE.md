# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

Tag Painter is a SvelteKit-based web application that interfaces with ComfyUI for AI image generation. The application allows users to create character art by providing tags across different zones (All, First Zone, Second Zone, Negative Tags) and generates images using a local ComfyUI instance.

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
- **ImageViewer.svelte**: Handles image display, navigation controls, and integrates mask drawing components
- **DrawingControls.svelte**: Dedicated component for mask drawing controls with radio-style tool selection
- **DrawingCanvas.svelte**: Canvas component for interactive mask drawing with brush and flood fill tools
- **GenerationControls.svelte**: Contains generation button, progress tracking, and settings dialog
- **LoraSelector.svelte**: Component for selecting and configuring LoRA models with weight adjustment
- **SettingsDialog.svelte**: Modal for configuring generation parameters
- **OptionsEditDialog.svelte**: Unified dialog for editing category options and settings with drag & drop support
- **AutoCompleteTextarea.svelte**: Enhanced textarea component with auto-completion from tag database
- **ComboBox.svelte**: Filtering and selection component for category management

### Utility Modules

Located in `src/lib/utils/` and `src/lib/stores/`:

- **imageGeneration.ts**: Extracted image generation logic and ComfyUI workflow management
- **comfyui.ts**: WebSocket communication and API interaction utilities
- **fileIO.ts**: File system operations for saving/loading prompts and images
- **promptProcessing.ts**: Tag processing and prompt generation utilities
- **workflow.ts**: ComfyUI workflow configuration constants and node definitions
- **date.ts**: Date and time formatting utilities for timestamps
- **types.ts**: Centralized TypeScript type definitions with tag zone support
- **constants.ts**: Application-wide constants and default values

### Store Modules

- **stores/promptsStore.ts**: Central Svelte store for tag zones data management and persistence
- **stores/tagsStore.ts**: Shared store for auto-completion tags and filtering
- **stores/testModeStore.ts**: Store for testing mode state management

### API Routes

- **`/api/prompts`**: Handles saving and loading tag zone data to/from `data/prompts.json`
- **`/api/settings`**: Handles saving and loading user settings to/from `data/settings.json`
- **`/api/image`**: Serves generated images from the output directory
- **`/api/image-list`**: Returns list of generated images in the output directory
- **`/api/tags`**: Provides autocomplete tags for prompt suggestions
- **`/api/loras`**: Handles LoRA model information and selection
- **`/api/mask-path`**: Provides composition mask file paths (handles temp-mask special case)
- **`/api/mask`**: Handles saving of user-drawn mask data to temporary file

### ComfyUI Integration

The application connects to a local ComfyUI instance at `http://127.0.0.1:8188` and uses:

- REST API for submitting workflows and fetching available checkpoints
- WebSocket connection for real-time progress updates and image delivery
- Dynamic workflow configuration based on user settings (upscale, face detailer, checkpoint selection)
- Automatic node injection for SaveImageWebsocket based on selected options

### Data Management

- **Tag Zone Storage**: User inputs are saved to `data/prompts.json` with tags organized by zones (All, First Zone, Second Zone, Negative Tags)
- **Image Storage**: Generated images are saved to `data/output/` with timestamp-based filenames
- **Mask Storage**: User-drawn masks are stored as `static/temp_mask.png` for web accessibility and reuse
- **Metadata Storage**: PNG images include embedded metadata with tag zone information for automatic restoration
- **Tag Database**: Comprehensive tag suggestions from `data/danbooru_tags.txt` (20,000+ tags)
- **State Management**: Uses Svelte 5's `$state`, stores, and callback patterns to avoid prop mutation warnings
- **Settings Persistence**: User preferences saved to `data/settings.json` with validation

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

- **Multi-zone tag system** with separate areas for different tag categories (All, First Zone, Second Zone, Negative Tags)
- **Visual composition selection** with clickable layout previews for image generation
- **Tag-based input** with individual tag boxes that can be removed independently
- **Quick tag entry** with autocomplete suggestions for rapid tag addition
- **Real-time progress tracking** during image generation with WebSocket communication
- **Dynamic checkpoint selection** from ComfyUI with automatic detection
- **LoRA model integration** with weight adjustment and visual selection interface
- **Optional upscaling and face detailing** with configurable settings
- **Automatic image saving** with embedded PNG metadata for tag restoration
- **Comprehensive tag autocomplete** with 20,000+ Danbooru tags and filtering
- **Persistent tag storage** with automatic saving and loading of tag zones
- **Image navigation** with position tracking and metadata loading control
- **Settings persistence** with validation and user preference management
- **Custom scrollbars** for improved UI aesthetics in tag zones
- **Interactive mask drawing** with brush and flood fill tools, custom cursors matching brush size, and black background for inpainting compatibility
- **Temporary mask storage** using single reusable file instead of timestamped files for simplified workflow

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
- **PNG metadata handling** uses chunk manipulation libraries for tag restoration and zone information
- **Tag zone system** organizes tags into All, First Zone, Second Zone, and Negative Tags categories
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
   - `src/lib/utils/tagExpansion.test.ts`: Tag expansion logic
   - `src/lib/utils/tagStyling.test.ts`: Tag styling utilities
   - `src/lib/stores/testModeStore.test.ts`: Test mode store functionality

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

## Puppeteer Configuration

When using Puppeteer MCP for screenshots, use these settings for optimal app capture:

- **Default screenshot size**: 1270x1300 pixels
- This size captures the full app interface including all tag zones, settings, and generated images
