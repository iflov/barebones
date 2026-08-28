const { registerHooks } = require('node:module');

const preloadOption = `--require=${JSON.stringify(__filename)}`;

if (!process.env.NODE_OPTIONS?.includes(__filename)) {
  process.env.NODE_OPTIONS = [process.env.NODE_OPTIONS, preloadOption].filter(Boolean).join(' ');
}

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (!specifier.startsWith('@nestjs/')) {
      return nextResolve(specifier, context);
    }

    const conditions = context.conditions.includes('import')
      ? context.conditions
      : [...context.conditions, 'import'];

    return nextResolve(specifier, {
      conditions,
      importAttributes: context.importAttributes,
      parentURL: context.parentURL,
    });
  },
});
