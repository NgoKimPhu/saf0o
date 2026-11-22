// Side-effect import: install the Node connection guard before any other module loads.
import { installNodeGuard } from '.'

installNodeGuard()
