/**
 * Common interface that all installation steps must implement
 * This allows the InstallWizard to control steps through a unified API
 */

export type StepStatus = 'pending' | 'in-progress' | 'completed' | 'skipped' | 'error'

export interface StepController {
  // Lifecycle methods
  init(): Promise<void>
  execute(): Promise<void>
  skip(): void
  reset(): void

  // State getters
  getStatus(): StepStatus
  isComplete(): boolean
  canProceed(): boolean
  getError(): string | null

  // UI state
  requiresUserConfirmation(): boolean
  getUserConfirmed(): boolean
  confirmStep(): void
}
