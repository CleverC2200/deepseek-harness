window.__ModuleLoader__.load({
  id: '@fixture/global-panel',
  factory(require) {
    const React = require('react')
    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('main', () => ctx.slots.register({
          name: 'main', key: 'fixture-global-panel',
        }, () => React.createElement('section', { 'data-global-panel': '' }, 'Global panel')))
        ctx.slots.inject('sidebar.panellist', () => ctx.slots.register({
          name: 'sidebar.panellist', id: 'fixture-global-panel', label: 'Global panel',
        }, () => null))
      },
    }
  },
})
