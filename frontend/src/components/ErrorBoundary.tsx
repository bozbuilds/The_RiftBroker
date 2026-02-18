import { Component, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
  resetKey: number
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null, resetKey: 0 }
  }

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error }
  }

  handleReset = () => {
    this.setState((s) => ({ hasError: false, error: null, resetKey: s.resetKey + 1 }))
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="error-boundary">
          <h3>Something went wrong</h3>
          <p>{this.state.error?.message ?? 'An unexpected error occurred.'}</p>
          <button className="btn-secondary" onClick={this.handleReset}>
            Try Again
          </button>
        </div>
      )
    }
    return <div key={this.state.resetKey}>{this.props.children}</div>
  }
}
