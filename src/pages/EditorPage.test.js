import { getOutputSections } from './EditorPage';

test('renders all distinct execution output fields', () => {
    expect(getOutputSections({
        stdout: 'program output',
        stderr: 'runtime warning',
        compileOutput: 'compiler output',
        message: 'provider message',
    })).toEqual([
        { label: 'Standard output', value: 'program output' },
        { label: 'Standard error', value: 'runtime warning' },
        { label: 'Compilation output', value: 'compiler output' },
        { label: 'Message', value: 'provider message' },
    ]);
});

test('does not duplicate overlapping provider fields', () => {
    expect(getOutputSections({ stdout: 'same', stderr: 'same', message: '' })).toEqual([
        { label: 'Standard output', value: 'same' },
    ]);
});
