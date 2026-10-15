import React from 'react';
import {Text, View} from 'react-native';
export class ErrorBoundary extends React.Component<React.PropsWithChildren, {error: Error | null}> { state = {error: null as Error | null}; static getDerivedStateFromError(error: Error) { return {error}; } render() { return this.state.error ? <View><Text>Something went wrong.</Text><Text>{this.state.error.message}</Text></View> : this.props.children; } }
